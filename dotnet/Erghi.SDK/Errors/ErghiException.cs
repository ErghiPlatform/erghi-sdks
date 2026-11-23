namespace Erghi.SDK.Errors;

/// <summary>
/// Base exception for all Erghi SDK errors.
/// </summary>
public class ErghiException : Exception
{
    public string Code { get; }
    public int? StatusCode { get; }
    public object? Details { get; }

    /// <summary>The server's machine-readable code from the response body (for example
    /// <c>offer_taken</c>, <c>private_reply_used</c>, <c>use_comment_reply</c>), or null when the
    /// body had none. Set for the workspace (admin) resources.</summary>
    public string? ServerCode { get; init; }

    public ErghiException(string message, string code, int? statusCode = null, object? details = null)
        : base(message)
    {
        Code = code;
        StatusCode = statusCode;
        Details = details;
    }
}

/// <summary>Thrown when authentication fails (401).</summary>
public sealed class AuthenticationException : ErghiException
{
    public AuthenticationException(string message = "Authentication failed")
        : base(message, "AUTHENTICATION_ERROR", 401) { }
}

/// <summary>Thrown when request validation fails (400).</summary>
public sealed class ValidationException : ErghiException
{
    public ValidationException(string message, object? errors = null)
        : base(message, "VALIDATION_ERROR", 400, errors) { }
}

/// <summary>Thrown when rate limit is exceeded (429).</summary>
public sealed class RateLimitException : ErghiException
{
    public int? RetryAfter { get; }

    public RateLimitException(string message = "Rate limit exceeded", int? retryAfter = null)
        : base(message, "RATE_LIMIT_ERROR", 429)
    {
        RetryAfter = retryAfter;
    }
}

/// <summary>Thrown when a resource is not found (404).</summary>
public sealed class NotFoundException : ErghiException
{
    public NotFoundException(string message = "Resource not found")
        : base(message, "NOT_FOUND", 404) { }
}

/// <summary>Thrown when a network or HTTP transport error occurs.</summary>
public sealed class NetworkException : ErghiException
{
    public NetworkException(string message, Exception? inner = null)
        : base(message, "NETWORK_ERROR", null, inner?.Message) { }
}

/// <summary>
/// A reply-engine call the platform refused with a machine-readable code, for example 409 <c>turn_closed</c>,
/// <c>turn_superseded</c>, <c>handoff_unavailable</c>, <c>human_engaged</c>, <c>conversation_closed</c>, <c>not_held</c>,
/// 403 <c>configure_ai_required</c>. <see cref="ErghiException.Code"/> is that code; <see cref="Reason"/> is the
/// close reason when the platform gives one.
/// </summary>
public sealed class ErghiApiException : ErghiException
{
    public string? Reason { get; }

    public ErghiApiException(string message, string code, int statusCode, string? reason = null, object? details = null)
        : base(message, code, statusCode, details)
    {
        Reason = reason;
    }
}
