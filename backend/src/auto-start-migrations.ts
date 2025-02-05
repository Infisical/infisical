import path from "node:path";

import dotenv from "dotenv";
import { Knex } from "knex";
import { Logger } from "pino";

import { PgSqlLock } from "./keystore/keystore";

dotenv.config();

type TArgs = {
  auditLogDb?: Knex;
  applicationDb: Knex;
  logger: Logger;
};

const migrationConfig = {
  directory: path.join(__dirname, "./db/migrations"),
  extension: "ts",
  tableName: "infisical_migrations"
};

const migrationStatusCheckErrorHandler = (err: Error) => {
  // happens for first time  in which the migration table itself is not created yet
  //    error: select * from "infisical_migrations" - relation "infisical_migrations" does not exist
  if (err?.message?.includes("does not exist")) {
    return true;
  }
  throw err;
};

export const runMigrations = async ({ applicationDb, auditLogDb, logger }: TArgs) => {
  try {
    const shouldRunMigration = Boolean(
      await applicationDb.migrate.status(migrationConfig).catch(migrationStatusCheckErrorHandler)
    ); // db.length - code.length
    if (!shouldRunMigration) {
      logger.info("No migrations pending: Skipping migration process.");
      return;
    }

    if (auditLogDb) {
      await auditLogDb.transaction(async (tx) => {
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.BootUpMigration]);
        logger.info("Running audit log migrations.");

        const didPreviousInstanceRunMigration = !(await auditLogDb.migrate
          .status(migrationConfig)
          .catch(migrationStatusCheckErrorHandler));
        if (didPreviousInstanceRunMigration) {
          logger.info("No audit log migrations pending: Applied by previous instance. Skipping migration process.");
          return;
        }

        await auditLogDb.migrate.latest(migrationConfig);
        logger.info("Finished audit log migrations.");
      });
    }

    await applicationDb.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.BootUpMigration]);
      logger.info("Running application migrations.");

      const didPreviousInstanceRunMigration = !(await applicationDb.migrate
        .status(migrationConfig)
        .catch(migrationStatusCheckErrorHandler));
      if (didPreviousInstanceRunMigration) {
        logger.info("No application migrations pending: Applied by previous instance. Skipping migration process.");
        return;
      }

      await applicationDb.migrate.latest(migrationConfig);
      logger.info("Finished application migrations.");
    });
  } catch (err) {
    logger.error(err, "Boot up migration failed");
    process.exit(1);
  }
};
