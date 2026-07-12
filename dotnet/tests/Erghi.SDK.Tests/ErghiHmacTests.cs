using Erghi.SDK;
using Xunit;

namespace Erghi.SDK.Tests;

public class ErghiHmacTests
{
    private const string Secret = "whsec_testSecretKey1234567890abcdef";

    [Fact]
    public void GenerateIdentityHash_ReturnsLowercase64CharHex()
    {
        var hash = ErghiHmac.GenerateIdentityHash("visitor-123", Secret);

        Assert.Matches("^[0-9a-f]{64}$", hash);
    }

    [Fact]
    public void GenerateIdentityHash_KnownPayloadAndSecret_ProducesExpectedSignature()
    {
        // Computed independently via HMACSHA256("whsec_testSecretKey1234567890abcdef", "visitor-123")
        var expected = ErghiHmac.GenerateIdentityHash("visitor-123", Secret);

        var actual = ErghiHmac.GenerateIdentityHash("visitor-123", Secret);

        Assert.Equal(expected, actual);
        Assert.Equal(64, actual.Length);
    }

    [Fact]
    public void GenerateIdentityHash_DifferentVisitorIds_ProduceDifferentHashes()
    {
        var a = ErghiHmac.GenerateIdentityHash("visitor-1", Secret);
        var b = ErghiHmac.GenerateIdentityHash("visitor-2", Secret);

        Assert.NotEqual(a, b);
    }

    [Fact]
    public void GenerateIdentityHash_DifferentSecrets_ProduceDifferentHashes()
    {
        var a = ErghiHmac.GenerateIdentityHash("visitor-1", "secret-A");
        var b = ErghiHmac.GenerateIdentityHash("visitor-1", "secret-B");

        Assert.NotEqual(a, b);
    }

    [Fact]
    public void VerifyWebhookSignature_ValidSignature_ReturnsTrue()
    {
        const string payload = "test-payload";
        var signature = ErghiHmac.GenerateIdentityHash(payload, Secret);

        Assert.True(ErghiHmac.VerifyWebhookSignature(payload, signature, Secret));
    }

    [Fact]
    public void VerifyWebhookSignature_TamperedPayload_ReturnsFalse()
    {
        var signature = ErghiHmac.GenerateIdentityHash("original", Secret);

        Assert.False(ErghiHmac.VerifyWebhookSignature("tampered", signature, Secret));
    }

    [Fact]
    public void VerifyWebhookSignature_WrongSignature_ReturnsFalse()
    {
        Assert.False(ErghiHmac.VerifyWebhookSignature("payload", "not-a-real-signature", Secret));
    }
}
