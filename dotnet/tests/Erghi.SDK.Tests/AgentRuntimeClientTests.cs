using System.Net;
using System.Text;
using Microsoft.AspNetCore.SignalR.Client;
using Erghi.SDK.Auth;
using Xunit;

namespace Erghi.SDK.Tests;

public class AgentRuntimeClientTests
{
    [Fact]
    public void TurnTracker_DeliversEachTurnOnce_AndKeepsTheHighestSequence()
    {
        var t = new TurnTracker();
        Assert.True(t.Accept("a", 5));
        Assert.False(t.Accept("a", 5));
        Assert.True(t.Accept("b", 3));          // out of order is still new
        Assert.Equal(5, t.LastSequence);
        Assert.True(t.Accept("c", 9));
        Assert.Equal(9, t.LastSequence);
    }

    [Fact]
    public void TurnTracker_StartsFromTheSuppliedSequence()
    {
        var t = new TurnTracker(lastSequence: 40);
        Assert.Equal(40, t.LastSequence);
        Assert.True(t.Accept("a", 41));
        Assert.Equal(41, t.LastSequence);
    }

    [Fact]
    public void TurnTracker_ForgetsTheOldestWhenFull()
    {
        var t = new TurnTracker(memory: 2);
        t.Accept("a", 1); t.Accept("b", 2); t.Accept("c", 3);
        Assert.True(t.Accept("a", 1)); // evicted, would be delivered again
        Assert.False(t.Accept("c", 3));
    }

    [Fact]
    public void RetryPolicy_BacksOffAndNeverGivesUp()
    {
        var policy = new ForeverRetryPolicy([TimeSpan.Zero, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(30)]);
        TimeSpan? At(long n) => policy.NextRetryDelay(new RetryContext { PreviousRetryCount = n, ElapsedTime = TimeSpan.FromDays(3) });
        Assert.Equal(TimeSpan.Zero, At(0));
        Assert.Equal(TimeSpan.FromSeconds(1), At(1));
        Assert.Equal(TimeSpan.FromSeconds(30), At(2));
        Assert.Equal(TimeSpan.FromSeconds(30), At(10_000));
    }

    [Fact]
    public void Options_AreValidated()
    {
        Assert.Throws<ArgumentException>(() => new AgentRuntimeClient(new AgentRuntimeOptions { ClientId = "a", ClientSecret = "b" }));
        Assert.Throws<ArgumentException>(() => new AgentRuntimeClient(new AgentRuntimeOptions { EngineId = "e" }));
        _ = new AgentRuntimeClient(new AgentRuntimeOptions { EngineId = "e", AccessTokenProvider = _ => Task.FromResult("t") });
    }

    [Fact]
    public async Task InvokeBeforeStart_ThrowsANetworkError()
    {
        var c = new AgentRuntimeClient(new AgentRuntimeOptions { EngineId = "e", AccessTokenProvider = _ => Task.FromResult("t") });
        await Assert.ThrowsAsync<Errors.NetworkException>(() => c.TypingAsync(Guid.NewGuid().ToString()));
    }

    private sealed class TokenHandler(Func<string> body) : HttpMessageHandler
    {
        public int Calls { get; private set; }
        public string? LastBody { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            LastBody = await request.Content!.ReadAsStringAsync(ct);
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body(), Encoding.UTF8, "application/json") };
        }
    }

    [Fact]
    public async Task TokenSource_CachesUntilNearExpiry_ThenRenews()
    {
        var n = 0;
        var handler = new TokenHandler(() => $$"""{"access_token":"tok{{++n}}","token_type":"Bearer","expires_in":7200}""");
        var now = new DateTimeOffset(2026, 11, 22, 10, 0, 0, TimeSpan.Zero);
        var src = new ClientCredentialsTokenSource("http://erghi.test/", "id", "secret", handler, () => now);

        Assert.Equal("tok1", await src.GetAsync());
        now = now.AddMinutes(100);
        Assert.Equal("tok1", await src.GetAsync());
        Assert.Equal(1, handler.Calls);
        Assert.Contains("\"grant_type\":\"client_credentials\"", handler.LastBody);

        now = now.AddMinutes(20); // 120 min: inside the 60 s skew of the 2 h expiry
        Assert.Equal("tok2", await src.GetAsync());
        src.Invalidate();
        Assert.Equal("tok3", await src.GetAsync());
    }
}
