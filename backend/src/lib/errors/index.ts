/* eslint-disable max-classes-per-file */

export class DatabaseError extends Error {
  name: string;

  error: unknown;

  constructor({ name, error, message }: { message?: string; name?: string; error: unknown }) {
    super(message || "Failed to execute db ops");
    this.name = name || "DatabaseError";
    this.error = error;
  }
}

export class InternalServerError extends Error {
  name: string;

  error: unknown;

  constructor({ name, error, message }: { message?: string; name?: string; error?: unknown }) {
    super(message || "Something went wrong");
    this.name = name || "InternalServerError";
    this.error = error;
  }
}

export class GatewayTimeoutError extends Error {
  name: string;

  error: unknown;

  constructor({ name, error, message }: { message?: string; name?: string; error?: unknown }) {
    super(message || "Timeout error");
    this.name = name || "GatewayTimeoutError";
    this.error = error;
  }
}

export class UnauthorizedError extends Error {
  name: string;

  error: unknown;

  constructor({ name, error, message }: { message?: string; name?: string; error?: unknown } = {}) {
    super(message ?? "You are not allowed to access this resource");
    this.name = name || "UnauthorizedError";
    this.error = error;
  }
}

export class ForbiddenRequestError extends Error {
  name: string;

  error: unknown;

  details?: unknown;

  constructor({
    name,
    error,
    message,
    details
  }: { message?: string; name?: string; error?: unknown; details?: unknown } = {}) {
    super(message ?? "You are not allowed to access this resource");
    this.name = name || "ForbiddenError";
    this.error = error;
    this.details = details;
  }
}

export class PermissionBoundaryError extends ForbiddenRequestError {
  constructor({
    message,
    name,
    error,
    details
  }: {
    message?: string;
    name?: string;
    error?: unknown;
    details?: unknown;
  }) {
    super({ message, name, error, details });
    this.name = "PermissionBoundaryError";
  }
}

export class BadRequestError extends Error {
  name: string;

  error: unknown;

  details?: unknown;

  constructor({
    name,
    error,
    message,
    details
  }: {
    message?: string;
    name?: string;
    error?: unknown;
    details?: unknown;
  }) {
    super(message ?? "The request is invalid");
    this.name = name || "BadRequest";
    this.error = error;
    this.details = details;
  }
}

export class RateLimitError extends Error {
  constructor({ message }: { message?: string }) {
    super(message || "Rate limit exceeded");
    this.name = "RateLimitExceeded";
  }
}

export class NotFoundError extends Error {
  name: string;

  error: unknown;

  constructor({ name, error, message }: { message?: string; name?: string; error?: unknown }) {
    super(message ?? "The requested entity is not found");
    this.name = name || "NotFound";
    this.error = error;
  }
}

export class DisableRotationErrors extends Error {
  name: string;

  error: unknown;

  constructor({ name, error, message }: { message: string; name?: string; error?: unknown }) {
    super(message);
    this.name = name || "DisableRotationErrors";
    this.error = error;
  }
}

export class ScimRequestError extends Error {
  name: string;

  schemas: string[];

  detail: string;

  status: number;

  error: unknown;

  constructor({
    name,
    error,
    detail,
    status
  }: {
    message?: string;
    name?: string;
    error?: unknown;
    detail: string;
    status: number;
  }) {
    super(detail ?? "The request is invalid");
    this.name = name || "ScimRequestError";
    this.schemas = ["urn:ietf:params:scim:api:messages:2.0:Error"];
    this.error = error;
    this.detail = detail;
    this.status = status;
  }
}

export class OidcAuthError extends Error {
  name: string;

  error: unknown;

  constructor({ name, error, message }: { message?: string; name?: string; error?: unknown }) {
    super(message || "Something went wrong");
    this.name = name || "OidcAuthError";
    this.error = error;
  }
}

export class CryptographyError extends Error {
  name: string;

  error: unknown;

  constructor({ name, error, message }: { message?: string; name?: string; error?: unknown }) {
    super(message || "Cryptographic operation failed");
    this.name = name || "CryptographyError";
    this.error = error;
  }
}

export class PolicyViolationError extends Error {
  name: string;

  error: unknown;

  details?: unknown;

  constructor({
    name,
    error,
    message,
    details
  }: { message?: string; name?: string; error?: unknown; details?: unknown } = {}) {
    super(message || "A policy is in place for this resource");
    this.name = name || "PolicyViolationError";
    this.error = error;
    this.details = details;
  }
}
