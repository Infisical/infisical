import { DatabaseErrorCode } from "@app/lib/error-codes";
import { DatabaseError } from "@app/lib/errors";

/**
 * Every name in Agent Vault is unique per scope in the database, and the pre-checks in the services can
 * always lose a race to a concurrent request. The loser would otherwise surface as a bare 500.
 */
export const isUniqueViolation = (err: unknown) =>
  err instanceof DatabaseError && (err.error as { code?: string })?.code === DatabaseErrorCode.UniqueViolation;
