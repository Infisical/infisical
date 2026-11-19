import {
  CapacityExceededError,
  DomainError,
  EntityNotFoundError,
  RuleViolationError,
  StateConflictError
} from "@app/domains/lib/errors";
import { BadRequestError, ConflictError, InternalServerError, NotFoundError, RateLimitError } from "@app/lib/errors";

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
  if (error instanceof CapacityExceededError) return new RateLimitError({ message: error.message });
  return new InternalServerError(props);
};
