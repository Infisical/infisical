import { DatabaseErrorCode } from "@app/lib/error-codes";

/**
 * Postgres error codes we translate into client errors instead of letting them surface as a 500.
 * See https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export enum PostgresErrorCode {
  /** string_data_right_truncation — a value was longer than its varchar(n) column. */
  StringDataRightTruncation = "22001"
}

const MAX_CAUSE_DEPTH = 5;

/**
 * Walk the `error` / `cause` chain of a thrown value looking for a Postgres error with `code`.
 *
 * DALs wrap the driver error in a `DatabaseError` (sometimes more than one layer deep), so the pg
 * error code is never on the outermost error.
 */
const findPostgresError = (
  err: unknown,
  code: PostgresErrorCode | DatabaseErrorCode
): { code: string; constraint?: unknown } | undefined => {
  let current = err;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;

    if ("code" in current && (current as { code?: unknown }).code === code) {
      return current as { code: string; constraint?: unknown };
    }

    const next =
      ("error" in current && (current as { error?: unknown }).error) ||
      ("cause" in current && (current as { cause?: unknown }).cause);

    if (!next || next === current) return undefined;
    current = next;
  }

  return undefined;
};

export const hasPostgresErrorCode = (err: unknown, code: PostgresErrorCode | DatabaseErrorCode): boolean =>
  Boolean(findPostgresError(err, code));

/** For a transaction that can trip more than one constraint of a kind, where the code alone can't say which. */
export const hasPostgresConstraintViolation = (
  err: unknown,
  code: PostgresErrorCode | DatabaseErrorCode,
  constraint: string
): boolean => findPostgresError(err, code)?.constraint === constraint;
