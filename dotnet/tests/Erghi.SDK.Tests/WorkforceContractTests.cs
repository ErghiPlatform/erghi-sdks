using System.Net;
using System.Text;
using System.Text.Json;
using Erghi.SDK.Errors;
using Erghi.SDK.Models;
using Erghi.SDK.Resources;
using Xunit;

namespace Erghi.SDK.Tests;

/// <summary>Pins the workforce wire contract: verbs, paths, query names, camelCase bodies and partial-update omission.</summary>
public class WorkforceContractTests
{
    private const string Status = """
        {"state":"away","reasonId":"r-1","reasonName":"Lunch","reasonColour":"#ccc","since":"2026-11-20T10:00:00Z",
         "seq":4,"source":"manual","changedByName":null,"note":null,"activeChats":1,"capacity":5,"awayReassignMinutes":null}
        """;
    private const string Reason = """
        {"id":"r-1","name":"Lunch","colour":"#ccc","maxMinutes":30,"reassignChats":false,"isSystem":false,
         "systemKey":null,"sortOrder":1,"archived":false}
        """;
    private const string Settings = """
        {"routing":{"aiRoutingEnabled":false,"languageMatch":"off","skillWaitSeconds":30,"offerMode":"off","offerTimeoutSeconds":20},
         "features":{"analytics":true,"aiRouting":false},"statusOnSignIn":"ready","requireAwayReason":false,
         "idleAwayMinutes":null,"signOutAfterHoursMinutes":null,"autoAwayAfterMissedOffers":null}
        """;

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

    private static (Stub, WorkforceResource) Make(string body, HttpStatusCode status = HttpStatusCode.OK)
    {
        var stub = new Stub(body, status);
        var http = new HttpClient(stub) { BaseAddress = new Uri("http://erghi.test/") };
        return (stub, new WorkforceResource(http));
    }

    private static string Path(Stub s, int i) => s.Seen[i].Uri.AbsolutePath;

    [Fact]
    public async Task Status_Calls()
    {
        var (stub, wf) = Make(Status);
        Assert.Equal("away", (await wf.GetMyStatusAsync()).State);
        await wf.SetMyStatusAsync("away", reasonId: "r-1");
        await wf.SetAgentStatusAsync("a-1", "offline", returnChats: true);
        await wf.SignOutAgentAsync("a-1");

        Assert.Equal(("GET", "/api/v1/workforce/me/status"), (stub.Seen[0].Method.Method, Path(stub, 0)));
        Assert.Equal(("PUT", "/api/v1/workforce/me/status"), (stub.Seen[1].Method.Method, Path(stub, 1)));
        Assert.Equal("""{"state":"away","reasonId":"r-1"}""", stub.Seen[1].Body);
        Assert.Equal("/api/v1/workforce/agents/a-1/status", Path(stub, 2));
        Assert.Equal("""{"state":"offline","returnChats":true}""", stub.Seen[2].Body);
        Assert.Equal(("POST", "/api/v1/workforce/agents/a-1/sign-out"), (stub.Seen[3].Method.Method, Path(stub, 3)));
    }

    [Fact]
    public async Task AwayReasons_Crud()
    {
        var (stub, wf) = Make(Reason);
        await wf.CreateAwayReasonAsync("Lunch", color: "#ccc", maxMinutes: 30);
        await wf.UpdateAwayReasonAsync("r-1", archived: false, reassignChats: true);
        await wf.ArchiveAwayReasonAsync("r-1");

        Assert.Equal("""{"name":"Lunch","color":"#ccc","maxMinutes":30}""", stub.Seen[0].Body);
        Assert.Equal(("PUT", "/api/v1/workforce/away-reasons/r-1"), (stub.Seen[1].Method.Method, Path(stub, 1)));
        Assert.Equal("""{"reassignChats":true,"archived":false}""", stub.Seen[1].Body);
        Assert.Equal("DELETE", stub.Seen[2].Method.Method);

        var (listStub, listWf) = Make($"[{Reason}]");
        var list = await listWf.ListAwayReasonsAsync(includeArchived: true);
        Assert.Equal("Lunch", list[0].Name);
        Assert.Equal("?includeArchived=true", listStub.Seen[0].Uri.Query);
        await listWf.ListAwayReasonsAsync();
        Assert.Equal("", listStub.Seen[1].Uri.Query);
    }

    [Fact]
    public async Task Skills_And_Profile()
    {
        var skill = """{"id":"s-1","name":"Billing","description":"Refunds","archived":false,"agentCount":2}""";
        var (stub, wf) = Make(skill);
        await wf.CreateSkillAsync("Billing", "Refunds");
        await wf.UpdateSkillAsync("s-1", name: "Billing 2");
        await wf.ArchiveSkillAsync("s-1");
        Assert.Equal("""{"name":"Billing","description":"Refunds"}""", stub.Seen[0].Body);
        Assert.Equal("""{"name":"Billing 2"}""", stub.Seen[1].Body);
        Assert.Equal("DELETE", stub.Seen[2].Method.Method);

        var profile = """{"userId":"u-1","maxConcurrentChats":4,"languages":["ar"],"skills":[{"id":"s-1","name":"Billing","level":2}]}""";
        var (pstub, pwf) = Make(profile);
        var saved = await pwf.SaveAgentProfileAsync("u-1", 4, ["ar"], [new AgentSkillLevel("s-1", 2)]);
        Assert.Equal(2, saved.Skills[0].Level);
        Assert.Equal(("PUT", "/api/v1/workforce/agents/u-1/profile"), (pstub.Seen[0].Method.Method, Path(pstub, 0)));
        Assert.Equal("""{"maxConcurrentChats":4,"languages":["ar"],"skills":[{"skillId":"s-1","level":2}]}""", pstub.Seen[0].Body);
        await pwf.SaveAgentProfileAsync("u-1");
        Assert.Equal("{}", pstub.Seen[1].Body);
    }

    [Fact]
    public async Task Settings_PartialUpdate_OmitsUnsetAndSendsZero()
    {
        var (stub, wf) = Make(Settings);
        var got = await wf.GetSettingsAsync();
        Assert.Null(got.IdleAwayMinutes);

        await wf.UpdateSettingsAsync(new UpdateWorkforceSettingsRequest { IdleAwayMinutes = 0 });
        await wf.UpdateSettingsAsync(new UpdateWorkforceSettingsRequest { RequireAwayReason = true, OfferMode = "ring" });
        await wf.UpdateSettingsAsync(new UpdateWorkforceSettingsRequest());

        Assert.Equal(("PUT", "/api/v1/workforce/settings"), (stub.Seen[1].Method.Method, Path(stub, 1)));
        Assert.Equal("""{"idleAwayMinutes":0}""", stub.Seen[1].Body);
        Assert.Equal("""{"requireAwayReason":true,"routing":{"offerMode":"ring"}}""", stub.Seen[2].Body);
        Assert.Equal("{}", stub.Seen[3].Body);
    }

    [Fact]
    public async Task Offers_And_RoutingDecision()
    {
        var (stub, wf) = Make("""{"items":[{"offerId":"o-1","conversationId":"c-1","attempt":1,"offeredAt":"2026-11-20T10:00:00Z","expiresAt":"2026-11-20T10:00:20Z"}]}""");
        Assert.Equal("o-1", (await wf.ListMyOffersAsync())[0].OfferId);
        Assert.Equal("/api/v1/workforce/offers/mine", Path(stub, 0));

        var (astub, awf) = Make("""{"conversationId":"c-1"}""");
        Assert.Equal("c-1", await awf.AcceptOfferAsync("o-1"));
        await awf.DeclineOfferAsync("o-1");
        Assert.Equal(("POST", "/api/v1/workforce/offers/o-1/accept"), (astub.Seen[0].Method.Method, Path(astub, 0)));
        Assert.Equal(("POST", "/api/v1/workforce/offers/o-1/decline"), (astub.Seen[1].Method.Method, Path(astub, 1)));

        var (dstub, dwf) = Make("""{"conversationId":"c-1","decidedAt":"2026-11-20T10:00:00Z","step":"assigned","candidates":[],"offers":[]}""");
        Assert.Equal("assigned", (await dwf.GetRoutingDecisionAsync("c-1")).Step);
        Assert.Equal("/api/v1/conversations/c-1/routing-decision", Path(dstub, 0));
    }

    [Fact]
    public async Task Reports_And_Live()
    {
        var (stub, wf) = Make("""{"rows":[]}""");
        await wf.GetLiveAsync();
        await wf.GetAgentStatusReportAsync(new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero), timeZone: "Africa/Cairo", groupBy: "agent");
        await wf.GetAgentStatusTimelineAsync("a-1");
        await wf.GetAgentPerformanceReportAsync(groupBy: "day");
        await wf.ExportAgentStatusCsvAsync();
        await wf.ExportAgentPerformanceCsvAsync();

        Assert.Equal("/api/v1/workforce/live", Path(stub, 0));
        Assert.Equal("/api/v1/reports/agent-status", Path(stub, 1));
        Assert.Equal("?from=2026-11-01T00%3A00%3A00.0000000Z&timeZone=Africa%2FCairo&groupBy=agent", stub.Seen[1].Uri.Query);
        Assert.Equal("/api/v1/reports/agent-status/timeline", Path(stub, 2));
        Assert.Equal("?agentId=a-1", stub.Seen[2].Uri.Query);
        Assert.Equal("?groupBy=day", stub.Seen[3].Uri.Query);
        Assert.Equal("/api/v1/reports/agent-status/export.csv", Path(stub, 4));
        Assert.Equal("/api/v1/reports/agent-performance/export.csv", Path(stub, 5));
    }

    [Fact]
    public async Task Conflict_SurfacesServerCode()
    {
        var (_, wf) = Make("""{"error":"taken","code":"offer_taken"}""", HttpStatusCode.Conflict);
        var ex = await Assert.ThrowsAsync<ErghiException>(() => wf.AcceptOfferAsync("o-1"));
        Assert.Equal(409, ex.StatusCode);
        Assert.Equal("offer_taken", ex.ServerCode);
    }
}
