/* eslint-disable max-classes-per-file */
export class DatabaseError extends Error {
  name: string;

  error: unknown;

  constructor({ name, error, message }: { message?: string; name: string; error: unknown }) {
    super(message || "Failed to execute db ops");
    this.name = name;
    this.error = error;
  }
}

export class UnauthorizedError extends Error {
  name: string;

  error: unknown;

  constructor({ name, error, message }: { message?: string; name: string; error?: unknown }) {
    super(message ?? "You are not allowed to access this resourve");
    this.name = name;
    this.error = error;
  }
}

export class BadRequestError extends Error {
  name: string;

  error: unknown;

  constructor({ name, error, message }: { message?: string; name: string; error?: unknown }) {
    super(message ?? "The request is invalid");
    this.name = name;
    this.error = error;
  }
}
