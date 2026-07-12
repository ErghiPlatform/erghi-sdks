/// Base exception for Erghi SDK
class ErghiException implements Exception {
  final String message;
  final int? statusCode;
  final dynamic details;

  ErghiException(this.message, {this.statusCode, this.details});

  @override
  String toString() {
    if (statusCode != null) {
      return 'ErghiException($statusCode): $message';
    }
    return 'ErghiException: $message';
  }
}

/// Authentication error
class AuthenticationException extends ErghiException {
  AuthenticationException(String message, {int? statusCode, dynamic details})
      : super(message, statusCode: statusCode, details: details);
}

/// Network error
class NetworkException extends ErghiException {
  NetworkException(String message, {int? statusCode, dynamic details})
      : super(message, statusCode: statusCode, details: details);
}

/// Validation error
class ValidationException extends ErghiException {
  ValidationException(String message, {int? statusCode, dynamic details})
      : super(message, statusCode: statusCode, details: details);
}

/// Resource not found error
class NotFoundException extends ErghiException {
  NotFoundException(String message, {int? statusCode, dynamic details})
      : super(message, statusCode: statusCode ?? 404, details: details);
}

/// WebSocket error
class WebSocketException extends ErghiException {
  WebSocketException(String message, {dynamic details})
      : super(message, details: details);
}
