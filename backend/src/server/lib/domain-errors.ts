import { DomainError, EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";

// Turns an error from src/domains into the HTTP error the handler already knows how to answer, log and
// count. A name the domain chose is kept; otherwise the HTTP class's own name is sent, as before.
export const toHttpError = (error: Error): Error => {
  if (!(error instanceof DomainError)) return error;

  const props = {
    message: error.message,
    name: error.hasDefaultName ? undefined : error.name,
    error
  };
  if (error instanceof RuleViolationError) return new BadRequestError({ ...props, details: error.details });
  if (error instanceof EntityNotFoundError) return new NotFoundError(props);
  return new InternalServerError(props);
};
