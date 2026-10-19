using System.Net;
using System.Text;
using System.Text.Json;
using Erghi.SDK.Errors;
using Erghi.SDK.Models;
using Erghi.SDK.Resources;
using Xunit;

namespace Erghi.SDK.Tests;

/// <summary>
/// Pins the wire contract: <c>/api/auth/*</c> is GoTrue behind the gateway
/// (snake_case bodies), workspaces live under <c>/api/v1/accounts/workspaces</c>.
/// </summary>
public class AuthWorkspaceContractTests
{
    private const string Session = """
        {"access_token":"at-1","refresh_token":"rt-1","expires_in":3600,"token_type":"bearer",
         "user":{"id":"u-1","email":"qa@example.com","role":"authenticated",
                 "email_confirmed_at":"2026-10-01T00:00:00Z","created_at":"2026-10-01T00:00:00Z",
                 "user_metadata":{"first_name":"Q","last_name":"A"}}}
        """;

    private sealed class StubHandler(Func<HttpRequestMessage, string> respond, HttpStatusCode status = HttpStatusCode.OK)
        : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, string? Body)> Seen { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(ct);
            Seen.Add((request, body));
            return new HttpResponseMessage(status)
            {
                Content = new StringContent(respond(request), Encoding.UTF8, "application/json"),
            };
        }
    }

    private static (StubHandler Stub, AuthResource Auth, WorkspaceResource Workspace) Make(
        Func<HttpRequestMessage, string> respond, HttpStatusCode status = HttpStatusCode.OK)
    {
        var stub = new StubHandler(respond, status);
        var http = new HttpClient(stub) { BaseAddress = new Uri("http://erghi.test/") };
        var client = new ErghiClient(new ErghiConfig { ApiUrl = "http://erghi.test" });
        return (stub, new AuthResource(http, client), new WorkspaceResource(http));
    }

    private static JsonElement Json(string? body) => JsonDocument.Parse(body!).RootElement;

    [Fact]
    public async Task Login_SendsOnlyCredentials_AndMapsSnakeCaseSession()
    {
        var (stub, auth, _) = Make(_ => Session);

        var result = await auth.LoginAsync(new LoginRequest("qa@example.com", "pw"));

        Assert.Equal("/api/auth/login", stub.Seen[0].Request.RequestUri!.AbsolutePath);
        Assert.Equal("""{"email":"qa@example.com","password":"pw"}""", stub.Seen[0].Body);
        Assert.Equal("at-1", result.AccessToken);
        Assert.Equal("Q", result.User.FirstName);
        Assert.True(result.User.EmailVerified);
        Assert.Equal("rt-1", auth.RefreshToken);
    }

    [Fact]
    public async Task Refresh_UsesTokenGrant()
    {
        var (stub, auth, _) = Make(_ => Session);
        await auth.LoginAsync(new LoginRequest("qa@example.com", "pw"));

        await auth.RefreshAsync();

        var refresh = stub.Seen[1];
        Assert.Equal("/api/auth/token", refresh.Request.RequestUri!.AbsolutePath);
        Assert.Equal("?grant_type=refresh_token", refresh.Request.RequestUri.Query);
        Assert.Equal("rt-1", Json(refresh.Body).GetProperty("refresh_token").GetString());
    }

    [Fact]
    public async Task Register_PendingConfirmation_ReturnsUserWithoutTokens()
    {
        var (stub, auth, _) = Make(_ => """
            {"id":"u-2","email":"qa@example.com","role":"authenticated","created_at":"2026-10-01T00:00:00Z",
             "user_metadata":{"first_name":"Q"}}
            """);

        var result = await auth.RegisterAsync(new RegisterRequest("qa@example.com", "pw", FirstName: "Q"));

        Assert.Equal("Q", Json(stub.Seen[0].Body).GetProperty("data").GetProperty("first_name").GetString());
        Assert.Equal("", result.AccessToken);
        Assert.Equal("u-2", result.User.Id);
        Assert.Equal("Q", result.User.FirstName);
        Assert.False(result.User.EmailVerified);
        Assert.Null(auth.AccessToken);
    }

    [Fact]
    public async Task Me_And_ForgotPassword_UseGoTruePaths()
    {
        var (stub, auth, _) = Make(r => r.Method == HttpMethod.Get ? Json(Session).GetProperty("user").GetRawText() : "{}");

        var user = await auth.MeAsync();
        await auth.ForgotPasswordAsync("qa@example.com");

        Assert.Equal("/api/auth/user", stub.Seen[0].Request.RequestUri!.AbsolutePath);
        Assert.Equal("u-1", user.Id);
        Assert.Equal("/api/auth/recover", stub.Seen[1].Request.RequestUri!.AbsolutePath);
    }

    [Fact]
    public async Task ResetPassword_UsesRecoverySessionToken()
    {
        var (stub, auth, _) = Make(r => r.Method == HttpMethod.Post ? """{"access_token":"recovery-at"}""" : "{}");

        await auth.ResetPasswordAsync("hash-1", "new-pw");

        Assert.Equal("recovery", Json(stub.Seen[0].Body).GetProperty("type").GetString());
        Assert.Equal("hash-1", Json(stub.Seen[0].Body).GetProperty("token_hash").GetString());
        var update = stub.Seen[1].Request;
        Assert.Equal(HttpMethod.Put, update.Method);
        Assert.Equal("/api/auth/user", update.RequestUri!.AbsolutePath);
        Assert.Equal("recovery-at", update.Headers.Authorization!.Parameter);
    }

    [Fact]
    public async Task GoTrueErrorText_IsSurfaced()
    {
        var (_, auth, _) = Make(_ => """{"code":400,"msg":"Invalid login credentials"}""", HttpStatusCode.BadRequest);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => auth.LoginAsync(new LoginRequest("qa@example.com", "x")));
        Assert.Equal("Invalid login credentials", ex.Message);
    }

    private const string Rows = """
        [{"workspaceId":"w-1","name":"One","slug":"one","isCurrent":true},
         {"workspaceId":"w-2","name":"Two","slug":null,"isCurrent":false}]
        """;

    [Fact]
    public async Task Workspaces_ListAndGet_UseAccountEndpoint()
    {
        var (stub, _, workspace) = Make(_ => Rows);

        var list = await workspace.ListAsync();
        var two = await workspace.GetAsync("w-2");

        Assert.Equal("/api/v1/accounts/workspaces", stub.Seen[0].Request.RequestUri!.AbsolutePath);
        Assert.Equal([new Workspace("w-1", "One", "one", true), new Workspace("w-2", "Two", "", false)], list);
        Assert.Equal("Two", two.Name);
        await Assert.ThrowsAsync<NotFoundException>(() => workspace.GetAsync("w-9"));
    }

    [Fact]
    public async Task Workspaces_Create_SendsServerFieldNames()
    {
        var (stub, _, workspace) = Make(_ => """{"workspaceId":"w-3","workspaceName":"Three"}""");

        var created = await workspace.CreateAsync(new CreateWorkspaceRequest("Three", "https://example.com"));

        Assert.Equal("""{"workspaceName":"Three","companyWebsite":"https://example.com"}""", stub.Seen[0].Body);
        Assert.Equal("w-3", created.Id);
    }

#pragma warning disable CS0618 // exercising the obsolete members on purpose
    [Fact]
    public async Task Workspaces_UpdateAndDelete_ThrowWithoutCallingTheApi()
    {
        var (stub, _, workspace) = Make(_ => "{}");

        await Assert.ThrowsAsync<ErghiException>(() => workspace.UpdateAsync("w-1", new UpdateWorkspaceRequest("x")));
        await Assert.ThrowsAsync<ErghiException>(() => workspace.DeleteAsync("w-1"));
        Assert.Empty(stub.Seen);
    }
#pragma warning restore CS0618
}
