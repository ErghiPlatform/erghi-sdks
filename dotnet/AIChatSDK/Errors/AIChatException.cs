namespace Erghi.SDK.Errors;

/// <summary>
/// Base exception for all Erghi SDK errors.
/// </summary>
public class AIChatException : Exception
{
    public string Code { get; }
    public int? StatusCode { get; }
    public object? Details { get; }

    public AIChatException(string message, string code, int? statusCode = null, object? details = null)
        : base(message)
    {
        Code = code;
        StatusCode = statusCode;
        Details = details;
    }
}

/// <summary>Thrown when authentication fails (401).</summary>
public sealed class AuthenticationException : AIChatException
{
    public AuthenticationException(string message = "Authentication failed")
        : base(message, "AUTHENTICATION_ERROR", 401) { }
}

/// <summary>Thrown when request validation fails (400).</summary>
public sealed class ValidationException : AIChatException
{
    public ValidationException(string message, object? errors = null)
        : base(message, "VALIDATION_ERROR", 400, errors) { }
}

/// <summary>Thrown when rate limit is exceeded (429).</summary>
public sealed class RateLimitException : AIChatException
{
    public int? RetryAfter { get; }

    public RateLimitException(string message = "Rate limit exceeded", int? retryAfter = null)
        : base(message, "RATE_LIMIT_ERROR", 429)
    {
        RetryAfter = retryAfter;
    }
}

/// <summary>Thrown when a resource is not found (404).</summary>
public sealed class NotFoundException : AIChatException
{
    public NotFoundException(string message = "Resource not found")
        : base(message, "NOT_FOUND", 404) { }
}

/// <summary>Thrown when a network or HTTP transport error occurs.</summary>
public sealed class NetworkException : AIChatException
{
    public NetworkException(string message, Exception? inner = null)
        : base(message, "NETWORK_ERROR", null, inner?.Message) { }
}
