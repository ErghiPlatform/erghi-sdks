using System.Net;
using System.Text;
using Erghi.SDK.Errors;
using Erghi.SDK.Models;
using Erghi.SDK.Resources;
using Xunit;

namespace Erghi.SDK.Tests;

/// <summary>Pins the reply-engine wire contract: verbs, paths, query names, body casing and error codes.</summary>
public class ReplyEngineContractTests
{
    private sealed class Stub(string body, HttpStatusCode status = HttpStatusCode.OK) : HttpMessageHandler
    {
        public List<(HttpMethod Method, Uri Uri, string Body)> Seen { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var sent = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
            Seen.Add((request.Method, request.RequestUri!, sent));
            return new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        }
    }

    private static (Stub, HttpClient) Http(string body, HttpStatusCode status = HttpStatusCode.OK)
    {
        var stub = new Stub(body, status);
        return (stub, new HttpClient(stub) { BaseAddress = new Uri("http://erghi.test/") });
    }

    private const string Engine = """
        {"id":"e-1","name":"Support bot","mode":"Webhook","status":"Active","timeoutSeconds":20,"fallback":"ErghiAi",
         "historyLimit":20,"includeContactDetails":false,"observeHumanMessages":false,"acceptSupersededReplies":false,
         "circuitFailureThreshold":5,"hasSecret":true,"createdAt":"2026-11-22T10:00:00Z","updatedAt":"2026-11-22T10:00:00Z",
         "bindingCount":1,"url":"https://agent.example.com/erghi","secret":"whsec_abc"}
        """;

    [Fact]
    public async Task Admin_UsesTheRightVerbsAndPaths()
    {
        var (stub, http) = Http(Engine);
        var api = new ReplyEnginesResource(http);

        var created = await api.CreateAsync(new CreateReplyEngineRequest
        { Mode = ReplyEngineModes.Webhook, Name = "Support bot", Url = "https://agent.example.com/erghi", TimeoutSeconds = 20 });
        Assert.Equal("whsec_abc", created.Secret);
        Assert.Equal("Webhook", created.Mode);
        Assert.True(created.HasSecret);
        await api.UpdateAsync("e-1", new UpdateReplyEngineRequest { Name = "Renamed" });
        await api.EnableAsync("e-1");
        await api.DisableAsync("e-1");
        await api.RotateSecretAsync("e-1");
        await api.GetAsync("e-1");

        Assert.Equal(
            [("POST", "/api/v1/reply-engines"), ("PATCH", "/api/v1/reply-engines/e-1"), ("POST", "/api/v1/reply-engines/e-1/enable"),
             ("POST", "/api/v1/reply-engines/e-1/disable"), ("POST", "/api/v1/reply-engines/e-1/rotate-secret"), ("GET", "/api/v1/reply-engines/e-1")],
            stub.Seen.Select(s => (s.Method.Method, s.Uri.AbsolutePath)).ToArray());
        // camelCase, unset fields omitted (PATCH semantics).
        Assert.Equal("""{"mode":"Webhook","name":"Support bot","timeoutSeconds":20,"url":"https://agent.example.com/erghi"}""", stub.Seen[0].Body);
        Assert.Equal("""{"name":"Renamed"}""", stub.Seen[1].Body);
    }

    [Fact]
    public async Task Admin_ListHealthTestAndTurns()
    {
        var (_, h1) = Http("""{"items":[],"allowedModes":["Webhook","LiveConnection"],"erghiPrincipalArn":null}""");
        var list = await new ReplyEnginesResource(h1).ListAsync();
        Assert.Equal(["Webhook", "LiveConnection"], list.AllowedModes);

        var (s2, h2) = Http("""[{"id":"e-1","name":"Bot","mode":"Queue","status":"Disabled"}]""");
        var names = await new ReplyEnginesResource(h2).ListNamesAsync();
        Assert.Equal("Disabled", names[0].Status);
        Assert.Equal("view=names", s2.Seen[0].Uri.Query.TrimStart('?'));

        var (_, h3) = Http("""{"windowHours":24,"turns":10,"replied":8,"fellBack":1,"failed":1,"timedOut":0,"successRate":0.8,"p50FirstReplyMs":900,"p95FirstReplyMs":4000,"circuit":{"state":"closed","openedAt":null,"retryAt":null,"consecutiveFailures":0}}""");
        var health = await new ReplyEnginesResource(h3).HealthAsync("e-1");
        Assert.Equal(0.8, health.SuccessRate);
        Assert.Equal("closed", health.Circuit.State);

        var (_, h4) = Http("""{"ok":false,"latencyMs":5000,"errorCode":"timeout","detail":null,"status":null}""");
        var test = await new ReplyEnginesResource(h4).TestAsync("e-1");
        Assert.False(test.Ok);
        Assert.Equal("timeout", test.ErrorCode);

        var (s5, h5) = Http("""{"items":[{"id":"t-1","conversationId":"c-1","status":"Replied","isTest":false,"sequence":3,"createdAt":"2026-11-22T10:00:00Z","dispatchedAt":null,"firstReplyAt":null,"closedAt":null,"firstReplyMs":1200,"closeReason":null,"fallbackUsed":null,"errorCode":null,"errorDetail":null,"replyCount":1}],"nextCursor":"abc=="}""");
        var page = await new ReplyEnginesResource(h5).ListTurnsAsync("e-1", cursor: "a b", limit: 10, includeTests: true);
        Assert.Equal("abc==", page.NextCursor);
        Assert.Equal(3, page.Items[0].Sequence);
        Assert.Equal("?cursor=a%20b&limit=10&includeTests=true", s5.Seen[0].Uri.Query);
    }

    [Fact]
    public async Task Admin_WidgetBinding()
    {
        var (stub, http) = Http("""{"default":"e-1","channels":{"telegram":"erghi"},"availableChannels":["telegram","whatsapp"]}""");
        var api = new ReplyEnginesResource(http);
        var current = await api.GetWidgetBindingAsync("w-1");
        Assert.Equal("e-1", current.Default);
        Assert.Equal(["telegram", "whatsapp"], current.AvailableChannels);

        await api.SetWidgetBindingAsync("w-1", new WidgetReplyEngineBinding("e-1", new() { ["telegram"] = "erghi", ["email"] = null }));
        Assert.Equal(("PUT", "/api/v1/widgets/w-1/reply-engine"), (stub.Seen[1].Method.Method, stub.Seen[1].Uri.AbsolutePath));
        Assert.Equal("""{"default":"e-1","channels":{"telegram":"erghi","email":null}}""", stub.Seen[1].Body);
    }

    [Fact]
    public async Task Admin_RefusalsCarryTheServerCode()
    {
        var (_, h403) = Http("""{"error":"You need configure_ai.","code":"configure_ai_required"}""", HttpStatusCode.Forbidden);
        var ex = await Assert.ThrowsAsync<ErghiApiException>(() => new ReplyEnginesResource(h403).ListAsync());
        Assert.Equal("configure_ai_required", ex.Code);
        Assert.Equal(403, ex.StatusCode);

        var (_, h400) = Http("""{"error":"Mode cannot change.","code":"mode_immutable"}""", HttpStatusCode.BadRequest);
        await Assert.ThrowsAsync<ValidationException>(() => new ReplyEnginesResource(h400).UpdateAsync("e-1", new UpdateReplyEngineRequest { Mode = "Queue" }));

        var (_, h404) = Http("""{"error":"Reply engine not found.","code":"not_found"}""", HttpStatusCode.NotFound);
        await Assert.ThrowsAsync<NotFoundException>(() => new ReplyEnginesResource(h404).GetAsync("nope"));
    }

    [Fact]
    public async Task Runtime_UsesSnakeCaseBodiesAndTheRightPaths()
    {
        var (stub, http) = Http("""{"turn_id":"t-1","message_ids":["m-1"]}""");
        var rt = new AgentRuntimeResource(http);

        var result = await rt.ReplyAsync("t-1", new AgentReply("t-1:1", [new AgentReplyMessage("Hello")], Final: false));
        Assert.Equal(["m-1"], result.MessageIds);
        await rt.TypingAsync("t-1");
        await rt.HandoffAsync("t-1", "needs a person");
        await rt.DeclineAsync("t-1", "out_of_scope");
        await rt.TakeBackAsync("c-1", force: true);
        await rt.PostBotMessageAsync("c-1", "k-1", "Anything else?");

        Assert.Equal(
            [("POST", "/api/v1/agent/turns/t-1/replies"), ("POST", "/api/v1/agent/turns/t-1/typing"), ("POST", "/api/v1/agent/turns/t-1/handoff"),
             ("POST", "/api/v1/agent/turns/t-1/decline"), ("POST", "/api/v1/agent/conversations/c-1/take-back"), ("POST", "/api/v1/agent/conversations/c-1/bot-messages")],
            stub.Seen.Select(s => (s.Method.Method, s.Uri.AbsolutePath)).ToArray());
        Assert.Equal("""{"idempotency_key":"t-1:1","messages":[{"content":"Hello"}],"final":false}""", stub.Seen[0].Body);
        Assert.Equal("""{"reason":"needs a person"}""", stub.Seen[2].Body);
        Assert.Equal("""{"reason":"out_of_scope"}""", stub.Seen[3].Body);
        Assert.Equal("""{"force":true}""", stub.Seen[4].Body);
        Assert.Equal("""{"idempotency_key":"k-1","content":"Anything else?"}""", stub.Seen[5].Body);
    }

    [Fact]
    public async Task Runtime_HandoffOnlyReplyOmitsMessages()
    {
        var (stub, http) = Http("""{"turn_id":"t-1","message_ids":[]}""");
        await new AgentRuntimeResource(http).ReplyAsync("t-1", new AgentReply("k", null, Handoff: new AgentHandoff("angry")));
        Assert.Equal("""{"idempotency_key":"k","messages":null,"handoff":{"reason":"angry"}}""".Replace("\"messages\":null,", ""), stub.Seen[0].Body);
    }

    [Fact]
    public async Task Runtime_GetTurn()
    {
        var (_, http) = Http("""{"turn_id":"t-1","conversation_id":"c-1","status":"Acked","deadline_at":"2026-11-22T10:00:30Z","is_test":false,"reply_count":2,"close_reason":null}""");
        var turn = await new AgentRuntimeResource(http).GetTurnAsync("t-1");
        Assert.Equal("Acked", turn.Status);
        Assert.Equal(2, turn.ReplyCount);
    }

    [Theory]
    [InlineData("turn_closed", """{"error":"This turn is closed.","code":"turn_closed","reason":"timeout"}""", "timeout")]
    [InlineData("turn_superseded", """{"error":"A newer visitor message replaced this turn.","code":"turn_superseded"}""", null)]
    public async Task Runtime_ClosedTurnsThrowWithTheCode(string code, string body, string? reason)
    {
        var (_, http) = Http(body, HttpStatusCode.Conflict);
        var ex = await Assert.ThrowsAsync<ErghiApiException>(() => new AgentRuntimeResource(http).ReplyAsync("t-1", AgentReply.Of("k", "hi")));
        Assert.Equal(code, ex.Code);
        Assert.Equal(409, ex.StatusCode);
        Assert.Equal(reason, ex.Reason);
    }

    [Fact]
    public async Task Runtime_IdsCannotAddPathSegments()
    {
        var (stub, http) = Http("""{"turn_id":"x","message_ids":[]}""");
        await new AgentRuntimeResource(http).TypingAsync("../admin");
        Assert.Equal("/api/v1/agent/turns/..%2Fadmin/typing", stub.Seen[0].Uri.PathAndQuery);
    }
}
