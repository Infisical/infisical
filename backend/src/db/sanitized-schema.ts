import { Knex } from "knex";
import path from "path";
import { Logger } from "pino";
import RE2 from "re2";

import { PgSqlLock } from "@app/keystore/keystore";

const SANITIZED_SCHEMA = "analytics";

type TArgs = {
  db: Knex;
  logger: Logger;
};

export const acquireSanitizedSchemaLock = async ({ db, logger }: TArgs): Promise<boolean> => {
  const res = await db.raw<{ rows: { lock_acquired: boolean }[] }>(
    "SELECT pg_try_advisory_xact_lock(?) as lock_acquired",
    [PgSqlLock.SanitizedSchemaGeneration]
  );
  if (res?.rows[0]?.lock_acquired) {
    logger.info("Acquired sanitized schema generation lock");
  } else {
    logger.info("Skipping sanitized schema generation: another instance is currently generating the schema");
  }
  return res?.rows[0]?.lock_acquired;
};

export const dropSanitizedSchema = async ({ db, logger }: TArgs): Promise<void> => {
  await db.raw(`DROP SCHEMA IF EXISTS "${SANITIZED_SCHEMA}" CASCADE`);
  logger.info("Dropped existing sanitized schema");
};

/* Validate the generated SQL to ensure it only contains CREATE SCHEMA IF NOT EXISTS and CREATE VIEW statements.
 * This is to prevent SQL injection and other security vulnerabilities as we'll be doing raw SQL execution.
 */
const validateGeneratedSQL = (sql: string): void => {
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const statement of statements) {
    const upper = statement.toUpperCase();
    const isAllowed = upper.startsWith("CREATE SCHEMA IF NOT EXISTS") || upper.startsWith("CREATE VIEW");

    if (!isAllowed) {
      throw new Error(
        `SANITIZED_SCHEMA_SECURITY_VIOLATION: Only CREATE SCHEMA IF NOT EXISTS and CREATE VIEW allowed. ` +
          `Got: ${statement.substring(0, 100)}`
      );
    }
  }
};

export const createSanitizedSchema = async ({ db, logger }: TArgs): Promise<void> => {
  // eslint-disable-next-line import/no-extraneous-dependencies
  const { loadConfig, generateSQL } = await import("@infisical/pg-view-generator");

  const config = await loadConfig(path.join(__dirname, "sanitized-schema.yaml"));
  const sql = generateSQL(config, { targetSchema: SANITIZED_SCHEMA });

  validateGeneratedSQL(sql);

  await db.raw(sql);
  logger.info("Created sanitized schema and views");
};

type TGrantArgs = TArgs & {
  role: string;
};

export const grantSanitizedSchemaAccess = async ({ db, logger, role }: TGrantArgs): Promise<void> => {
  // Validate role name to prevent SQL injection
  const roleNameRegex = new RE2("^[a-zA-Z0-9_-]+$");
  if (!roleNameRegex.test(role)) {
    throw new Error(
      `SANITIZED_SCHEMA_SECURITY_VIOLATION: Invalid role name. Only alphanumeric characters, underscores, and hyphens are allowed. Got: ${role}`
    );
  }

  // eslint-disable-next-line import/no-extraneous-dependencies
  const { generateGrantReadAccessSQL } = await import("@infisical/pg-view-generator");

  const sql = generateGrantReadAccessSQL(SANITIZED_SCHEMA, role);
  await db.raw(sql);
  logger.info(`Granted read access on sanitized schema to role: ${role}`);
};
