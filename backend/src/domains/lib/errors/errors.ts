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

// Valid request, but the current state blocks it: taken, in use, or changed since the caller read it. Re-reading
// and retrying may work.
export class StateConflictError extends DomainError {}

// Something we depend on failed. Nothing the caller sent is wrong.
export class ExternalSystemError extends DomainError {}

// A CASL rule that matched a refused check, listed in the 403 response.
export type TPermissionDeniedRule = {
  action: unknown;
  inverted?: boolean;
  subject: unknown;
  conditions?: unknown;
};

export type TPermissionDenial = {
  action: string;
  subject: string;
  // Set when the check named an object (an environment and secret path, a key name).
  subjectFields?: Record<string, unknown>;
  matchedRules: TPermissionDeniedRule[];
};

// For a refused change to another actor's roles or privileges (Permission.assertBounds). The HTTP layer answers it
// as PermissionBoundaryError.
export const PERMISSION_BOUNDARY_ERROR_NAME = "PermissionBoundaryError";

// `denial` is set for a refused permission check and feeds the 403 response and the permission-denied audit log.
// Refusals with no check behind them (not a member, another org's project) only carry a message.
export class PermissionDeniedError extends DomainError {
  readonly denial?: TPermissionDenial;

  constructor(props: { denial: TPermissionDenial; cause?: unknown } | TDomainErrorProps) {
    if ("denial" in props) {
      const { denial, cause } = props;
      super({
        message: `You are not allowed to ${denial.action} on ${denial.subject}`,
        name: "PermissionDenied",
        details: denial.matchedRules,
        cause
      });
      this.denial = denial;
    } else {
      super(props);
    }
  }

  get isBoundaryRefusal(): boolean {
    return this.name === PERMISSION_BOUNDARY_ERROR_NAME;
  }
}
