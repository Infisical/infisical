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

const isProduction = process.env.NODE_ENV === "production";
const migrationConfig = {
  directory: path.join(__dirname, "./db/migrations"),
  loadExtensions: [".mjs", ".ts"],
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
    // akhilmhdh(Feb 10 2025): 2 years  from now remove this
    if (isProduction) {
      const migrationTable = migrationConfig.tableName;
      const hasMigrationTable = await applicationDb.schema.hasTable(migrationTable);
      if (hasMigrationTable) {
        const firstFile = (await applicationDb(migrationTable).where({}).first()) as { name: string };
        if (firstFile?.name?.includes(".ts")) {
          await applicationDb(migrationTable).update({
            name: applicationDb.raw("REPLACE(name, '.ts', '.mjs')")
          });
        }
      }
      if (auditLogDb) {
        const hasMigrationTableInAuditLog = await auditLogDb.schema.hasTable(migrationTable);
        if (hasMigrationTableInAuditLog) {
          const firstFile = (await auditLogDb(migrationTable).where({}).first()) as { name: string };
          if (firstFile?.name?.includes(".ts")) {
            await auditLogDb(migrationTable).update({
              name: auditLogDb.raw("REPLACE(name, '.ts', '.mjs')")
            });
          }
        }
      }
    }

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

    await applicationDb.transaction(async () => {
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
