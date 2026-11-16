using System.Net;
using System.Text;
using Erghi.SDK.Errors;
using Erghi.SDK.Resources;
using Xunit;

namespace Erghi.SDK.Tests;

/// <summary>Pins the inbox and contacts wire contract: verbs, paths, query names and camelCase bodies.</summary>
public class InboxContractTests
{
    private const string Label = """{"id":"l-1","name":"VIP","color":"#ff0000","description":null}""";
    private const string Note = """
        {"id":"n-1","conversationId":"c-1","authorId":"u-1","authorName":"Sam","content":"hi",
         "createdAt":"2026-11-10T10:00:00Z","updatedAt":"2026-11-10T10:00:00Z","canEdit":true,"canDelete":true}
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

    private static (Stub, HttpClient) Http(string body, HttpStatusCode status = HttpStatusCode.OK)
    {
        var stub = new Stub(body, status);
        return (stub, new HttpClient(stub) { BaseAddress = new Uri("http://erghi.test/") });
    }

    [Fact]
    public async Task Labels_Crud_UsesTheRightVerbsAndPaths()
    {
        var (stub, http) = Http("""{"maxLabels":50,"labels":[{"id":"l-1","name":"VIP","color":"#ff0000","description":null}]}""");
        var inbox = new InboxResource(http);

        var list = await inbox.ListLabelsAsync();
        Assert.Equal(50, list.MaxLabels);
        Assert.Equal("VIP", list.Labels[0].Name);

        var (stub2, http2) = Http(Label);
        var inbox2 = new InboxResource(http2);
        await inbox2.CreateLabelAsync("VIP", "#ff0000");
        await inbox2.UpdateLabelAsync("l-1", "Vip");
        await inbox2.DeleteLabelAsync("l-1");

        Assert.Equal(("POST", "/api/v1/conversation-labels"), (stub2.Seen[0].Method.Method, stub2.Seen[0].Uri.AbsolutePath));
        Assert.Contains("\"name\":\"VIP\"", stub2.Seen[0].Body);
        Assert.Equal(("PUT", "/api/v1/conversation-labels/l-1"), (stub2.Seen[1].Method.Method, stub2.Seen[1].Uri.AbsolutePath));
        Assert.Equal(("DELETE", "/api/v1/conversation-labels/l-1"), (stub2.Seen[2].Method.Method, stub2.Seen[2].Uri.AbsolutePath));
        Assert.Equal("/api/v1/conversation-labels", stub.Seen[0].Uri.AbsolutePath);
    }

    [Fact]
    public async Task ConversationLabels_SetAddRemove()
    {
        var (stub, http) = Http($"[{Label}]");
        var inbox = new InboxResource(http);

        await inbox.GetConversationLabelsAsync("c-1");
        await inbox.SetConversationLabelsAsync("c-1", ["l-1", "l-2"]);
        await inbox.AddConversationLabelAsync("c-1", "l-1");
        var left = await inbox.RemoveConversationLabelAsync("c-1", "l-1");

        Assert.Equal("l-1", left[0].Id);
        Assert.Equal("PUT", stub.Seen[1].Method.Method);
        Assert.Equal("""{"labelIds":["l-1","l-2"]}""", stub.Seen[1].Body);
        Assert.Equal(("POST", "/api/v1/conversations/c-1/labels/l-1"), (stub.Seen[2].Method.Method, stub.Seen[2].Uri.AbsolutePath));
        Assert.Equal("DELETE", stub.Seen[3].Method.Method);
    }

    [Fact]
    public async Task Notes_SendMentionsOnlyWhenGiven()
    {
        var (stub, http) = Http(Note);
        var inbox = new InboxResource(http);

        var note = await inbox.CreateNoteAsync("c-1", "hi");
        await inbox.CreateNoteAsync("c-1", "hi @a", ["u-2"]);
        await inbox.UpdateNoteAsync("c-1", "n-1", "edited");
        await inbox.DeleteNoteAsync("c-1", "n-1");

        Assert.Equal("Sam", note.AuthorName);
        Assert.Equal("""{"content":"hi"}""", stub.Seen[0].Body);
        Assert.Equal("""{"content":"hi @a","mentionedUserIds":["u-2"]}""", stub.Seen[1].Body);
        Assert.Equal(("PUT", "/api/v1/conversations/c-1/notes/n-1"), (stub.Seen[2].Method.Method, stub.Seen[2].Uri.AbsolutePath));
        Assert.Equal("DELETE", stub.Seen[3].Method.Method);
    }

    [Fact]
    public async Task Notes_ApiKeyForbidden_Throws()
    {
        var (_, http) = Http("""{"error":"Notes are written by workspace members.","code":"member_required"}""", HttpStatusCode.Forbidden);
        var ex = await Assert.ThrowsAsync<ErghiException>(() => new InboxResource(http).CreateNoteAsync("c-1", "hi"));
        Assert.Equal(403, ex.StatusCode);
    }

    [Fact]
    public async Task CannedResponses_SearchAndCrud()
    {
        var (stub, http) = Http("""{"maxResponses":100,"responses":[{"id":"r-1","shortCode":"hi","content":"Hello","updatedAt":"2026-11-10T10:00:00Z"}]}""");
        var inbox = new InboxResource(http);

        var all = await inbox.ListCannedResponsesAsync();
        await inbox.ListCannedResponsesAsync("hel lo");

        Assert.Equal("hi", all.Responses[0].ShortCode);
        Assert.Equal("", stub.Seen[0].Uri.Query);
        Assert.Equal("?search=hel%20lo", stub.Seen[1].Uri.Query);

        var (stub2, http2) = Http("""{"id":"r-1","shortCode":"hi","content":"Hello","updatedAt":"2026-11-10T10:00:00Z"}""");
        var inbox2 = new InboxResource(http2);
        await inbox2.CreateCannedResponseAsync("hi", "Hello");
        await inbox2.UpdateCannedResponseAsync("r-1", "hi", "Hey");
        await inbox2.DeleteCannedResponseAsync("r-1");
        Assert.Equal("""{"shortCode":"hi","content":"Hello"}""", stub2.Seen[0].Body);
        Assert.Equal("/api/v1/canned-responses/r-1", stub2.Seen[1].Uri.AbsolutePath);
        Assert.Equal("DELETE", stub2.Seen[2].Method.Method);
    }

    [Fact]
    public async Task Notifications_ListCountAndRead()
    {
        var (stub, http) = Http("""[{"id":"x-1","type":"mention","conversationId":"c-1","noteId":"n-1","actorId":"u-2","actorName":"Lee","preview":"hi","createdAt":"2026-11-10T10:00:00Z","readAt":null}]""");
        var inbox = new InboxResource(http);

        var items = await inbox.ListNotificationsAsync(unreadOnly: true, limit: 10);
        Assert.Equal("Lee", items[0].ActorName);
        Assert.Null(items[0].ReadAt);
        Assert.Equal("?unreadOnly=true&limit=10", stub.Seen[0].Uri.Query);

        var (_, http2) = Http("""{"count":3}""");
        Assert.Equal(3, await new InboxResource(http2).GetUnreadNotificationCountAsync());

        var (stub3, http3) = Http("");
        var inbox3 = new InboxResource(http3);
        await inbox3.MarkNotificationReadAsync("x-1");
        await inbox3.MarkAllNotificationsReadAsync();
        Assert.Equal("/api/v1/notifications/x-1/read", stub3.Seen[0].Uri.AbsolutePath);
        Assert.Equal("/api/v1/notifications/read-all", stub3.Seen[1].Uri.AbsolutePath);
    }

    [Fact]
    public async Task Mentionable_And_Unassign()
    {
        var (stub, http) = Http("""[{"userId":"u-2","displayName":"Lee"}]""");
        var members = await new InboxResource(http).ListMentionableMembersAsync();
        Assert.Equal("u-2", members[0].UserId);
        Assert.Equal("/api/v1/team/mentionable", stub.Seen[0].Uri.AbsolutePath);

        var (stub2, http2) = Http("""{"id":"c-1","workspaceId":"w","widgetId":"wd","visitorId":null,"assignedAgentId":null,"status":"Open","channel":"widget","startedAt":"2026-11-10T10:00:00Z","closedAt":null,"metadata":null}""");
        var conv = await new InboxResource(http2).UnassignConversationAsync("c-1");
        Assert.Null(conv.AssignedAgentId);
        Assert.Equal(("POST", "/api/conversations/c-1/unassign"), (stub2.Seen[0].Method.Method, stub2.Seen[0].Uri.AbsolutePath));
    }

    [Fact]
    public async Task Contacts_ListFilters_Get_Update_Block_Erase()
    {
        var (stub, http) = Http("""{"items":[{"id":"k-1","name":"Ann","email":null,"phone":null,"externalId":"x","firstSeenAt":"2026-11-01T10:00:00Z","lastSeenAt":"2026-11-02T10:00:00Z","blocked":false,"conversationCount":2}],"total":1,"page":2,"pageSize":25}""");
        var contacts = new ContactsResource(http);

        var page = await contacts.ListAsync("ann", blocked: false, page: 2);
        Assert.Equal(2, page.Items[0].ConversationCount);
        Assert.Equal("?search=ann&blocked=false&page=2", stub.Seen[0].Uri.Query);

        var (stub2, http2) = Http("""{"id":"k-1","name":"Ann","email":null,"phone":null,"externalId":null,"locale":"ar","firstSeenAt":"2026-11-01T10:00:00Z","lastSeenAt":"2026-11-02T10:00:00Z","blocked":false,"blockedAt":null,"conversations":[{"id":"c-1","channel":"widget","status":"open","startedAt":"2026-11-01T10:00:00Z","closedAt":null,"assignedAgentId":null}]}""");
        var c2 = new ContactsResource(http2);
        var detail = await c2.GetAsync("k-1");
        Assert.Equal("ar", detail.Locale);
        Assert.Equal("open", detail.Conversations[0].Status);
        await c2.UpdateAsync("k-1", new Models.UpdateContactRequest(Email: ""));
        await c2.BlockAsync("k-1");
        await c2.UnblockAsync("k-1");
        Assert.Equal("PATCH", stub2.Seen[1].Method.Method);
        Assert.Equal("""{"email":""}""", stub2.Seen[1].Body);
        Assert.Equal("/api/v1/contacts/k-1/block", stub2.Seen[2].Uri.AbsolutePath);
        Assert.Equal("/api/v1/contacts/k-1/unblock", stub2.Seen[3].Uri.AbsolutePath);

        var (stub3, http3) = Http("""{"conversationsDeleted":2,"messagesDeleted":9}""");
        var erased = await new ContactsResource(http3).EraseAsync("k-1");
        Assert.Equal((2, 9), (erased.ConversationsDeleted, erased.MessagesDeleted));
        Assert.Equal(("DELETE", "/api/v1/contacts/k-1"), (stub3.Seen[0].Method.Method, stub3.Seen[0].Uri.AbsolutePath));
    }

    [Fact]
    public async Task ContactNotes_Crud()
    {
        var (stub, http) = Http("""{"id":"n-1","contactId":"k-1","authorId":"u-1","authorName":null,"content":"vip","createdAt":"2026-11-10T10:00:00Z","updatedAt":"2026-11-10T10:00:00Z","canEdit":true,"canDelete":false}""");
        var contacts = new ContactsResource(http);
        var note = await contacts.CreateNoteAsync("k-1", "vip");
        await contacts.UpdateNoteAsync("k-1", "n-1", "x");
        await contacts.DeleteNoteAsync("k-1", "n-1");
        Assert.Equal("k-1", note.ContactId);
        Assert.Equal("""{"content":"vip"}""", stub.Seen[0].Body);
        Assert.Equal("/api/v1/contacts/k-1/notes/n-1", stub.Seen[1].Uri.AbsolutePath);
        Assert.Equal("DELETE", stub.Seen[2].Method.Method);
    }
}
