namespace Erghi.SDK;

using System.Security.Cryptography;
using System.Text;

/// <summary>
/// HMAC utilities for server-side visitor identity verification and webhook signature
/// validation. These are static, stateless helpers — they do not require an <see cref="ErghiClient"/>
/// instance and must only be called from your backend.
/// Keep your <c>WidgetSecretKey</c> / workspace webhook secret on the server — never expose it to clients.
/// </summary>
public static class ErghiHmac
{
    /// <summary>
    /// Generates an HMAC-SHA256 hex digest of the <paramref name="visitorId"/> using the
    /// workspace's <c>WidgetSecretKey</c>.
    /// </summary>
    /// <remarks>
    /// Call this server-side when a user is logged in, then pass the resulting hash together with
    /// the <paramref name="visitorId"/> to the Erghi widget so the backend can verify the visitor's
    /// identity without trusting an unauthenticated client-supplied ID.
    /// </remarks>
    /// <param name="visitorId">Your system's user/visitor identifier.</param>
    /// <param name="secretKey">The <c>whsec_…</c> secret from the Erghi Admin Portal.</param>
    /// <returns>Lowercase hex-encoded HMAC-SHA256 digest (64 characters).</returns>
    public static string GenerateIdentityHash(string visitorId, string secretKey)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(visitorId);
        ArgumentException.ThrowIfNullOrWhiteSpace(secretKey);

        var keyBytes = Encoding.UTF8.GetBytes(secretKey);
        var msgBytes = Encoding.UTF8.GetBytes(visitorId);

        using var hmac = new HMACSHA256(keyBytes);
        var hash = hmac.ComputeHash(msgBytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    /// <summary>
    /// Verifies an incoming Erghi webhook signature using constant-time comparison.
    /// </summary>
    /// <remarks>
    /// Erghi signs webhook payloads with <c>HMAC-SHA256(rawBody, webhookSecret)</c> and sends the
    /// result in the <c>X-Erghi-Signature</c> request header. Always verify before processing.
    /// </remarks>
    /// <param name="payload">The raw request body string (do not deserialize JSON first).</param>
    /// <param name="signature">The value of the <c>X-Erghi-Signature</c> header.</param>
    /// <param name="secret">Your workspace webhook secret.</param>
    /// <returns><see langword="true"/> if the signature is valid.</returns>
    public static bool VerifyWebhookSignature(string payload, string signature, string secret)
    {
        if (string.IsNullOrEmpty(payload) || string.IsNullOrEmpty(signature) || string.IsNullOrEmpty(secret))
        {
            return false;
        }

        try
        {
            var expected = GenerateIdentityHash(payload, secret);
            return CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected),
                Encoding.UTF8.GetBytes(signature.ToLowerInvariant())
            );
        }
        catch
        {
            return false;
        }
    }
}
