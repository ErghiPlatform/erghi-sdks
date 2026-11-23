using System.Security.Cryptography;
using System.Text;

namespace Erghi.SDK;

/// <summary>Thrown by <see cref="ErghiWebhooks.Verify"/> when a delivery cannot be trusted. <see cref="Reason"/> is one of
/// <c>missing_headers</c>, <c>bad_timestamp</c>, <c>timestamp_too_old</c>, <c>timestamp_in_future</c>,
/// <c>no_matching_signature</c>.</summary>
public sealed class WebhookVerificationException(string reason)
    : Errors.ErghiException($"Webhook verification failed: {reason}", "WEBHOOK_VERIFICATION_FAILED", null, reason)
{
    public string Reason { get; } = reason;
}

/// <summary>
/// Verifies the Standard Webhooks signature (standardwebhooks.com) Erghi puts on reply-engine webhook deliveries
/// (<c>turn.requested</c> and the informational events) and on workspace webhooks:
/// headers <c>webhook-id</c>, <c>webhook-timestamp</c> (Unix seconds) and <c>webhook-signature</c> (one or more
/// space-separated <c>v1,&lt;base64&gt;</c>), the signature being HMAC-SHA256 of <c>{id}.{timestamp}.{rawBody}</c> keyed
/// with the base64 bytes after the <c>whsec_</c> prefix. During a secret rotation Erghi signs with both secrets, so
/// any matching entry is enough. Verify the <b>raw</b> request body, before parsing it. Server-side only.
/// </summary>
public static class ErghiWebhooks
{
    public const string IdHeader = "webhook-id";
    public const string TimestampHeader = "webhook-timestamp";
    public const string SignatureHeader = "webhook-signature";
    public static readonly TimeSpan DefaultTolerance = TimeSpan.FromMinutes(5);

    /// <summary>The signature header value for a delivery (what Erghi would send). Useful in your own tests.</summary>
    public static string Sign(string secret, string id, long timestamp, string body)
    {
        var key = DecodeSecret(secret);
        var hash = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{id}.{timestamp}.{body}"));
        return "v1," + Convert.ToBase64String(hash);
    }

    /// <summary>Returns true when the delivery is authentic and fresh. Never throws for a bad delivery; throws
    /// <see cref="ArgumentException"/> only for a malformed <paramref name="secret"/> (a programming error).</summary>
    public static bool TryVerify(
        string secret, string? id, string? timestamp, string? signature, string body,
        TimeSpan? tolerance = null, DateTimeOffset? now = null) =>
        Check(secret, id, timestamp, signature, body, tolerance ?? DefaultTolerance, now ?? DateTimeOffset.UtcNow) is null;

    /// <summary>Like <see cref="TryVerify"/> but throws <see cref="WebhookVerificationException"/> with the reason.</summary>
    public static void Verify(
        string secret, string? id, string? timestamp, string? signature, string body,
        TimeSpan? tolerance = null, DateTimeOffset? now = null)
    {
        var failure = Check(secret, id, timestamp, signature, body, tolerance ?? DefaultTolerance, now ?? DateTimeOffset.UtcNow);
        if (failure is not null) throw new WebhookVerificationException(failure);
    }

    /// <summary>Verifies with headers read from a case-insensitive lookup, then parses the body as a turn.</summary>
    public static Models.TurnRequest VerifyAndParseTurn(
        string secret, Func<string, string?> header, string body,
        TimeSpan? tolerance = null, DateTimeOffset? now = null)
    {
        Verify(secret, header(IdHeader), header(TimestampHeader), header(SignatureHeader), body, tolerance, now);
        return Models.TurnRequest.Parse(body);
    }

    private static string? Check(string secret, string? id, string? timestamp, string? signature, string body,
        TimeSpan tolerance, DateTimeOffset now)
    {
        var key = DecodeSecret(secret);
        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(timestamp) || string.IsNullOrEmpty(signature)) return "missing_headers";
        if (!long.TryParse(timestamp, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var ts))
            return "bad_timestamp";

        var age = now.ToUnixTimeSeconds() - ts;
        if (age > tolerance.TotalSeconds) return "timestamp_too_old";
        if (-age > tolerance.TotalSeconds) return "timestamp_in_future";

        var expected = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{id}.{ts}.{body}"));
        var matched = false;
        foreach (var part in signature.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var comma = part.IndexOf(',');
            if (comma <= 0 || part[..comma] != "v1") continue;
            byte[] candidate;
            try { candidate = Convert.FromBase64String(part[(comma + 1)..]); }
            catch (FormatException) { continue; }
            // Compare every entry (no early exit) so timing does not reveal which one matched.
            matched |= CryptographicOperations.FixedTimeEquals(candidate, expected);
        }
        return matched ? null : "no_matching_signature";
    }

    private static byte[] DecodeSecret(string secret)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(secret);
        var raw = secret.StartsWith("whsec_", StringComparison.Ordinal) ? secret["whsec_".Length..] : secret;
        try { return Convert.FromBase64String(raw); }
        catch (FormatException) { throw new ArgumentException("The signing secret is not a valid whsec_ secret.", nameof(secret)); }
    }
}
