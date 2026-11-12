/* eslint-disable max-classes-per-file */

export type TDomainErrorProps = {
  message: string;
  name?: string;
  details?: unknown;
  cause?: unknown;
};

// What went wrong, in the domain's own terms. A domain never names a status code: the HTTP boundary
// (server/lib/domain-errors.ts) decides the response for each kind.
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

// A rule about the domain's data refuses the operation. The caller can fix it by asking for something else.
export class RuleViolationError extends DomainError {}

// The thing the operation names does not exist.
export class EntityNotFoundError extends DomainError {}

// A system the domain depends on failed or gave no usable answer. Nothing the caller sent is wrong.
export class ExternalSystemError extends DomainError {}
