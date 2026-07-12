/**
 * Custom error classes for Erghi SDK
 */

export class ErghiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'ErghiError';
    Object.setPrototypeOf(this, ErghiError.prototype);
  }
}

export class AuthenticationError extends ErghiError {
  constructor(message: string = 'Authentication failed', details?: any) {
    super(message, 'AUTH_ERROR', 401, details);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class ValidationError extends ErghiError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class RateLimitError extends ErghiError {
  constructor(
    message: string = 'Rate limit exceeded',
    public readonly retryAfter?: number
  ) {
    super(message, 'RATE_LIMIT_ERROR', 429);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class NetworkError extends ErghiError {
  constructor(message: string = 'Network request failed', details?: any) {
    super(message, 'NETWORK_ERROR', undefined, details);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export class NotFoundError extends ErghiError {
  constructor(message: string = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}
