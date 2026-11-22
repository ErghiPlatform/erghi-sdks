using Erghi.SDK;
using Xunit;

namespace Erghi.SDK.Tests;

/// <summary>Signature vectors were computed independently with Python's hmac/hashlib, not with this SDK.</summary>
public class ReplyEngineWebhookTests
{
    // The Standard Webhooks project's published example.
    private const string Secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
    private const string Id = "msg_p5jXN8AQM9LWM0D4loKWxJek";
    private const long Ts = 1614265330;
    private const string Body = """{"test": 2432232314}""";
    private const string Sig = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";
    private static readonly DateTimeOffset Now = DateTimeOffset.FromUnixTimeSeconds(Ts + 10);

    [Fact]
    public void Sign_MatchesIndependentVector() => Assert.Equal(Sig, ErghiWebhooks.Sign(Secret, Id, Ts, Body));

    [Fact]
    public void Sign_NonAsciiBody_MatchesIndependentVector()
    {
        const string secret = "whsec_Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=";
        const string id = "5d1b6a8e-0f3c-4c1e-9a77-2f6f1c0a9b11";
        const string body = "{\"type\":\"turn.requested\",\"turn_id\":\"5d1b6a8e-0f3c-4c1e-9a77-2f6f1c0a9b11\",\"message\":\"héllo ✓\"}";
        Assert.Equal("v1,2lbb+AcVHkBFMsf0EpgAk5OuJKJ0yKpUFT9mgUZkV5o=", ErghiWebhooks.Sign(secret, id, 1790000000, body));
    }

    [Fact]
    public void Verify_AcceptsAValidDelivery() =>
        Assert.True(ErghiWebhooks.TryVerify(Secret, Id, Ts.ToString(), Sig, Body, now: Now));

    [Fact]
    public void Verify_AcceptsAnyEntryDuringRotation() =>
        Assert.True(ErghiWebhooks.TryVerify(Secret, Id, Ts.ToString(), "v1,AAAA " + Sig, Body, now: Now));

    [Fact]
    public void Verify_RejectsATamperedBody() =>
        Assert.False(ErghiWebhooks.TryVerify(Secret, Id, Ts.ToString(), Sig, Body + " ", now: Now));

    [Fact]
    public void Verify_RejectsAnotherId() =>
        Assert.False(ErghiWebhooks.TryVerify(Secret, "msg_other", Ts.ToString(), Sig, Body, now: Now));

    [Fact]
    public void Verify_RejectsAWrongSecret() =>
        Assert.False(ErghiWebhooks.TryVerify("whsec_Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=", Id, Ts.ToString(), Sig, Body, now: Now));

    [Theory]
    [InlineData(301, "timestamp_too_old")]
    [InlineData(-301, "timestamp_in_future")]
    public void Verify_RejectsOutsideTheFiveMinuteWindow(int offsetSeconds, string reason)
    {
        var now = DateTimeOffset.FromUnixTimeSeconds(Ts + offsetSeconds);
        var ex = Assert.Throws<WebhookVerificationException>(() => ErghiWebhooks.Verify(Secret, Id, Ts.ToString(), Sig, Body, now: now));
        Assert.Equal(reason, ex.Reason);
    }

    [Fact]
    public void Verify_AcceptsJustInsideTheWindow() =>
        Assert.True(ErghiWebhooks.TryVerify(Secret, Id, Ts.ToString(), Sig, Body, now: DateTimeOffset.FromUnixTimeSeconds(Ts + 299)));

    [Theory]
    [InlineData(null, "1", "v1,x")]
    [InlineData("id", null, "v1,x")]
    [InlineData("id", "1", null)]
    public void Verify_RejectsMissingHeaders(string? id, string? ts, string? sig)
    {
        var ex = Assert.Throws<WebhookVerificationException>(() => ErghiWebhooks.Verify(Secret, id, ts, sig, Body));
        Assert.Equal("missing_headers", ex.Reason);
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("-5")]
    [InlineData("1.5")]
    public void Verify_RejectsABadTimestamp(string ts)
    {
        var ex = Assert.Throws<WebhookVerificationException>(() => ErghiWebhooks.Verify(Secret, Id, ts, Sig, Body, now: Now));
        Assert.Equal("bad_timestamp", ex.Reason);
    }

    [Fact]
    public void Verify_IgnoresGarbageAndOtherVersions() =>
        Assert.False(ErghiWebhooks.TryVerify(Secret, Id, Ts.ToString(), "v2," + Sig[3..] + " v1,!!!notbase64", Body, now: Now));

    [Fact]
    public void Verify_MalformedSecretIsAProgrammingError() =>
        Assert.Throws<ArgumentException>(() => ErghiWebhooks.TryVerify("whsec_not base64!", Id, Ts.ToString(), Sig, Body, now: Now));

    [Fact]
    public void VerifyAndParseTurn_ReturnsTheTurn()
    {
        const string body = """
            {"type":"turn.requested","api_version":"2026-11-22","turn_id":"11111111-1111-1111-1111-111111111111","sequence":7,
             "engine_id":"22222222-2222-2222-2222-222222222222","workspace_id":"33333333-3333-3333-3333-333333333333",
             "deadline_at":"2026-11-22T10:00:30Z","is_test":false,
             "conversation":{"id":"c-1","channel":"web","widget_id":"w-1","language":"ar","status":"Open","metadata":{"page":"/x"},
               "visitor":{"id":"v-1","name":"Sam"},"summary":null},
             "messages":[{"id":"m-1","conversation_id":"c-1","sender":"visitor","sender_id":null,"is_ai":false,"type":"text",
               "content":"hi","attachments":[{"id":"a-1","file_name":"f.png","content_type":"image/png","size":10}],
               "created_at":"2026-11-22T09:59:50Z","reply_origin":null,"reply_engine_name":null}],
             "history":[],
             "reply":{"url":"https://api/x/replies","typing_url":"https://api/x/typing","handoff_url":"h","decline_url":"d"}}
            """;
        const string secret = "whsec_Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=";
        var sig = ErghiWebhooks.Sign(secret, "11111111-1111-1111-1111-111111111111", Ts, body);
        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Webhook-Id"] = "11111111-1111-1111-1111-111111111111",
            ["Webhook-Timestamp"] = Ts.ToString(),
            ["Webhook-Signature"] = sig,
        };
        var turn = ErghiWebhooks.VerifyAndParseTurn(secret, h => headers.GetValueOrDefault(h), body, now: Now);
        Assert.Equal(7, turn.Sequence);
        Assert.Equal("ar", turn.Conversation.Language);
        Assert.Equal("Sam", turn.Conversation.Visitor!.Name);
        Assert.Equal("f.png", turn.Messages[0].Attachments![0].FileName);
        Assert.Equal("https://api/x/typing", turn.Reply!.TypingUrl);
    }
}
