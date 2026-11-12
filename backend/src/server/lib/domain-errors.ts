import { DomainError, EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";

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
  return new InternalServerError(props);
};
