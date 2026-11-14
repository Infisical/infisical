/* eslint-disable max-classes-per-file */

export type TDomainErrorProps = {
  message: string;
  name?: string;
  details?: unknown;
  cause?: unknown;
};

// Domains never pick a status code; server/lib/domain-errors.ts maps each kind to one.
export abstract class DomainError extends Error {
  readonly details?: unknown;

  // False when `name` was given, so the boundary knows to keep it.
  readonly hasDefaultName: boolean;

  constructor({ message, name, details, cause }: TDomainErrorProps) {
    super(message, { cause });
    this.name = name ?? new.target.name;
    this.hasDefaultName = name === undefined;
    this.details = details;
  }
}

// The caller can fix it by asking for something else.
export class RuleViolationError extends DomainError {}

export class EntityNotFoundError extends DomainError {}

// The request is valid, but the current state prevents it: the thing is taken or in use, or it changed since the
// caller read it. Reading it again and retrying may succeed.
export class StateConflictError extends DomainError {}

// Something we depend on failed. Nothing the caller sent is wrong.
export class ExternalSystemError extends DomainError {}
