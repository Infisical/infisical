import {
  DomainError,
  EntityNotFoundError,
  PermissionDeniedError,
  RuleViolationError,
  StateConflictError
} from "@app/domains/lib/errors";
import {
  BadRequestError,
  ConflictError,
  ForbiddenRequestError,
  InternalServerError,
  NotFoundError,
  PermissionBoundaryError
} from "@app/lib/errors";

// Keeps a name the domain chose; otherwise the HTTP class's name is sent.
export const toHttpError = (error: Error): Error => {
  if (!(error instanceof DomainError)) return error;

  const props = {
    message: error.message,
    name: error.hasDefaultName ? undefined : error.name,
    error
  };
  if (error instanceof RuleViolationError) return new BadRequestError({ ...props, details: error.details });
  if (error instanceof EntityNotFoundError) return new NotFoundError(props);
  if (error instanceof StateConflictError) return new ConflictError(props);
  // Same body as a CASL denial: error "PermissionDenied", the refused action and subject, and the rules that matched.
  if (error instanceof PermissionDeniedError && error.isBoundaryRefusal)
    return new PermissionBoundaryError({ ...props, details: error.details });
  if (error instanceof PermissionDeniedError) return new ForbiddenRequestError({ ...props, details: error.details });
  return new InternalServerError(props);
};
