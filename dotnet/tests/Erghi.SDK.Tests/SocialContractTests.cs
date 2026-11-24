using System.Net;
using System.Text;
using Erghi.SDK.Errors;
using Erghi.SDK.Models;
using Erghi.SDK.Resources;
using Xunit;

namespace Erghi.SDK.Tests;

/// <summary>Pins the social inbox wire contract.</summary>
public class SocialContractTests
{
    private const string Comment = """
        {"id":"k-1","connectionId":"n-1","postId":"p-1","conversationId":"c-1","platform":"facebook","externalCommentId":"x1",
         "parentExternalCommentId":null,"authorExternalId":"a1","authorName":"Ann","text":"hi","isFromPage":false,
         "visibility":"visible","postedAt":"2026-11-20T10:00:00Z","canPrivateReply":true,
         "privateReplyExpiresAt":"2026-11-27T10:00:00Z","unanswered":true,"needsAttention":false}
        """;
    private const string Settings = """
        {"connectionId":"n-1","channelType":"facebook","name":"Page","dmsEnabled":true,"commentsEnabled":true,
         "autoHideSpam":true,"autoHideScamImpersonation":true,"autoHideAbuse":false,"commentReplyMode":"suggest",
         "autoPublicRepliesEnabled":false,"publicAcknowledgmentEnabled":false,"replyToPraise":false,
         "maxAutoPublicRepliesPerPostPerHour":5,"allowedLinkDomains":[]}
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

    private static (Stub, SocialResource) Make(string body, HttpStatusCode status = HttpStatusCode.OK)
    {
        var stub = new Stub(body, status);
        return (stub, new SocialResource(new HttpClient(stub) { BaseAddress = new Uri("http://erghi.test/") }));
    }

    private static string Path(Stub s, int i) => s.Seen[i].Uri.AbsolutePath;

    [Fact]
    public async Task ConnectionSettings_PartialUpdate()
    {
        var (stub, social) = Make(Settings);
        await social.GetConnectionSettingsAsync("n-1");
        await social.UpdateConnectionSettingsAsync("n-1", new UpdateSocialConnectionSettingsRequest
        {
            CommentReplyMode = "auto",
            AutoHideAbuse = false,
            AllowedLinkDomains = [],
        });

        Assert.Equal(("PUT", "/api/v1/channels/meta/connections/n-1/settings"), (stub.Seen[1].Method.Method, Path(stub, 1)));
        // Only the passed fields are sent; an empty list is still sent because it clears the list.
        Assert.Equal("""{"autoHideAbuse":false,"commentReplyMode":"auto","allowedLinkDomains":[]}""", stub.Seen[1].Body);
    }

    [Fact]
    public async Task Connections_Preview_And_Disconnect()
    {
        var conn = """[{"id":"n-1","channelType":"facebook","externalAccountId":"e1","name":"Page","status":"active","connectedAt":"2026-11-01T10:00:00Z","needsReauth":false}]""";
        var (stub, social) = Make(conn);
        Assert.Equal("n-1", (await social.ListConnectionsAsync())[0].Id);
        Assert.Equal("/api/v1/channels/meta/connections", Path(stub, 0));

        var (istub, isocial) = Make("""[{"id":"n-1","channelType":"instagram","name":null,"status":"Active"}]""");
        Assert.Equal("instagram", (await isocial.ListInboxConnectionsAsync())[0].ChannelType);
        Assert.Equal("/api/v1/social/connections", Path(istub, 0));

        var (pstub, psocial) = Make("""{"connectionId":"n-1","channelType":"facebook","openConversationCount":3,"openConversationScope":"workspace"}""");
        Assert.Equal(3, (await psocial.GetDisconnectPreviewAsync("n-1")).OpenConversationCount);
        Assert.Equal("/api/v1/channels/meta/connections/n-1/disconnect-preview", Path(pstub, 0));

        var (dstub, dsocial) = Make("", HttpStatusCode.NoContent);
        await dsocial.DisconnectConnectionAsync("n-1");
        Assert.Equal(("DELETE", "/api/v1/channels/meta/connections/n-1"), (dstub.Seen[0].Method.Method, Path(dstub, 0)));
    }

    [Fact]
    public async Task Dm_Helpers()
    {
        var (stub, social) = Make("""{"state":"open","requiresHumanAgentTag":false,"humanAgentApproved":false}""");
        Assert.Equal("open", (await social.GetReplyPolicyAsync("c-1")).State);
        Assert.Equal("/api/v1/channels/meta/conversations/c-1/reply-policy", Path(stub, 0));

        var (dstub, dsocial) = Make("""[{"messageId":"m-1","status":"sent"}]""");
        Assert.Equal("sent", (await dsocial.ListDeliveriesAsync("c-1"))[0].Status);
        Assert.Equal("/api/v1/channels/meta/conversations/c-1/deliveries", Path(dstub, 0));
    }

    [Fact]
    public async Task Posts_And_Comments_Queries()
    {
        var (stub, social) = Make($$"""{"items":[{{Comment}}],"total":1,"page":1,"pageSize":20}""");
        var page = await social.ListCommentsAsync(postId: "p-1", category: "question", hidden: false, needsAttention: true, page: 2);
        Assert.Equal("hi", page.Items[0].Text);
        Assert.Equal("?postId=p-1&category=question&hidden=false&needsAttention=true&page=2", stub.Seen[0].Uri.Query);
        await social.ListCommentsAsync();
        Assert.Equal("", stub.Seen[1].Uri.Query);

        var post = """{"id":"p-1","connectionId":"n-1","platform":"facebook","externalPostId":"x","isAd":false,"commentCount":2,"needsAttentionCount":1}""";
        var (pstub, psocial) = Make($$"""{"items":[{{post}}],"total":1,"page":1,"pageSize":20}""");
        var posts = await psocial.ListPostsAsync(connectionId: "n-1", pageSize: 20);
        Assert.Equal(2, posts.Items[0].CommentCount);
        Assert.Equal("/api/v1/social/posts", Path(pstub, 0));
        Assert.Equal("?connectionId=n-1&pageSize=20", pstub.Seen[0].Uri.Query);
    }

    [Fact]
    public async Task Moderation_Actions()
    {
        var (stub, social) = Make(Comment);
        await social.HideCommentAsync("k-1");
        await social.UnhideCommentAsync("k-1");
        await social.ReplyToCommentAsync("k-1", "thanks");
        await social.MarkCommentDoneAsync("k-1");
        Assert.All(stub.Seen, s => Assert.Equal("POST", s.Method.Method));
        Assert.Equal(
            ["/api/v1/social/comments/k-1/hide", "/api/v1/social/comments/k-1/unhide",
             "/api/v1/social/comments/k-1/reply", "/api/v1/social/comments/k-1/done"],
            stub.Seen.Select(s => s.Uri.AbsolutePath));
        Assert.Equal("""{"text":"thanks"}""", stub.Seen[2].Body);

        var (pstub, psocial) = Make($$"""{"comment":{{Comment}},"conversationId":"c-2"}""");
        Assert.Equal("c-2", (await psocial.PrivateReplyToCommentAsync("k-1", "dm")).ConversationId);
        Assert.Equal("/api/v1/social/comments/k-1/private-reply", Path(pstub, 0));
        Assert.Equal("""{"text":"dm"}""", pstub.Seen[0].Body);

        var (istub, isocial) = Make("""{"contactId":"ct-1","ignored":true}""");
        Assert.True((await isocial.IgnoreCommentContactAsync("k-1")).Ignored);
        Assert.Equal("/api/v1/social/comments/k-1/ignore-contact", Path(istub, 0));
    }

    [Fact]
    public async Task Report_And_Csv()
    {
        var report = """
            {"from":"2026-10-24T00:00:00Z","to":"2026-11-23T00:00:00Z","commentsReceived":10,"byCategory":{"question":4},
             "bySentiment":{},"byChannel":{},"autoHidden":1,"agentHidden":0,"unhiddenByAgent":0,"falsePositiveRate":null,
             "commentsAnswered":6,"commentsUnanswered":4,"medianResponseSeconds":null,"avgResponseSeconds":null,
             "aiPublicRepliesPosted":0,"aiPublicRepliesRefused":0,"dmVolume":[]}
            """;
        var (stub, social) = Make(report);
        Assert.Equal(10, (await social.GetReportAsync(timeZone: "Africa/Cairo")).CommentsReceived);
        Assert.Equal("?timeZone=Africa%2FCairo", stub.Seen[0].Uri.Query);

        var (cstub, csocial) = Make("a,b\n1,2\n");
        Assert.StartsWith("a,b", await csocial.ExportReportCsvAsync());
        Assert.Equal("/api/v1/reports/social/export.csv", Path(cstub, 0));
    }

    [Fact]
    public async Task UseCommentReply_SurfacesServerCode()
    {
        var (_, social) = Make("""{"error":"use the comment reply","code":"use_comment_reply"}""", HttpStatusCode.Conflict);
        var ex = await Assert.ThrowsAsync<ErghiException>(() => social.ReplyToCommentAsync("k-1", "x"));
        Assert.Equal(409, ex.StatusCode);
        Assert.Equal("use_comment_reply", ex.ServerCode);
    }
}
