using System.Net;
using System.Text;
using Erghi.SDK.Errors;
using Erghi.SDK.Models;
using Erghi.SDK.Resources;
using Xunit;

namespace Erghi.SDK.Tests;

/// <summary>Conversation calls pick the key-scoped endpoints when the client holds a workspace API key.</summary>
public class ChatApiKeyTests
{
    private const string Conv = """
        {"id":"c-1","workspaceId":"w-1","widgetId":"wd-1","visitorId":null,"assignedAgentId":null,
         "status":"Open","channel":"telegram","startedAt":"2026-11-18T10:00:00Z","closedAt":null,"metadata":null}
        """;

    private sealed class Stub(string body) : HttpMessageHandler
    {
        public List<HttpRequestMessage> Seen { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Seen.Add(request);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            });
        }
    }

    private static (Stub, ChatResource) Make(ErghiConfig config)
    {
        var stub = new Stub(Conv);
        var http = new HttpClient(stub) { BaseAddress = new Uri("http://erghi.test/") };
        return (stub, new ChatResource(http, new ErghiClient(config)));
    }

    [Fact]
    public async Task ApiKey_UsesTheKeyScopedEndpoints_AndReadsPascalCaseStatus()
    {
        var (stub, chat) = Make(new ErghiConfig { ApiUrl = "http://erghi.test", ClientId = "cid", ClientSecret = "s" });

        var conversation = await chat.GetConversationAsync("c-1");
        await chat.CloseConversationAsync("c-1");

        Assert.Equal("/api/v1/agent/conversations/c-1", stub.Seen[0].RequestUri!.AbsolutePath);
        Assert.Equal("/api/v1/agent/conversations/c-1/close", stub.Seen[1].RequestUri!.AbsolutePath);
        Assert.Equal("Open", conversation.Status);
    }

    [Fact]
    public async Task ApiKey_RefusesAttachments()
    {
        var (_, chat) = Make(new ErghiConfig { ApiUrl = "http://erghi.test", ClientId = "cid", ClientSecret = "s" });
        var ex = await Assert.ThrowsAsync<ErghiException>(() =>
            chat.SendMessageWithAttachmentAsync("c-1", "hi", new MemoryStream([1]), "a.txt"));
        Assert.Equal("ATTACHMENTS_NOT_SUPPORTED_FOR_API_KEYS", ex.Code);
    }

    [Fact]
    public async Task TeammateToken_KeepsTheMemberEndpoints()
    {
        var (stub, chat) = Make(new ErghiConfig { ApiUrl = "http://erghi.test", AccessToken = "jwt" });
        await chat.ListConversationsAsync();
        Assert.Equal("/api/conversations", stub.Seen[0].RequestUri!.AbsolutePath);
    }
}
