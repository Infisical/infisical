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

const getLockTableName = (tableName: string): string => {
  return `${tableName}_lock`;
};

const isMigrationInitialized = async (db: Knex, logger: Logger): Promise<boolean> => {
  const { tableName } = migrationConfig;
  const lockTableName = getLockTableName(tableName);
  const tableExists = await db.schema.hasTable(lockTableName);
  if (!tableExists) {
    logger.info("Migration tables not initialized");
    return false;
  }

  const rowCount = await db(lockTableName).count().first();
  logger.info(`Migration tables initialized, ${rowCount?.count}`);
  return (rowCount?.count as number) > 0;
};

const ensureMigrationTables = async (db: Knex, logger: Logger): Promise<void> => {
  const isInitialized = await isMigrationInitialized(db, logger);
  if (isInitialized) {
    return;
  }
  await db.transaction(async (tx) => {
    // This is to prevent multiple instances from initializing the migration table at the same time.
    // While the Knex migration system comes with its own lock mechanism, but it doesn't handle the
    // case where multiple instances are trying to initialize the migration table at the same time.
    // Therefore, we need to use a separate lock to prevent multiple instances from initializing the migration table at the same time.
    await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.BootUpMigration]);
    if (await isMigrationInitialized(tx, logger)) {
      // After we acquire the lock, check again and see if the migration table is still not initialized.
      // It's possible multiple instances sees the missing migration table and try to initialize it at the same time.
      // But only the one instance which acquired the lock will be able to initialize the migration table.
      logger.info("Migration tables already initialized by another instance, skipping initialization.");
      return;
    }
    // The currentVersion will call ensureTable, end up creating the migration table, lock table,
    // and insert the first row into the lock table.
    await tx.migrate.currentVersion(migrationConfig);
    logger.info("Migration tables initialized");
  });
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
      await ensureMigrationTables(auditLogDb, logger);
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
    }

    await ensureMigrationTables(applicationDb, logger);
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
