import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

import dotenv from "dotenv";
import { Knex } from "knex";
import { Logger } from "pino";

import { applyJitter, delay } from "@app/lib/delay";

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

const getStartupLockTableName = (tableName: string): string => {
  return `${tableName}_startup_lock`;
};

const isMigrationInitialized = async (db: Knex, logger: Logger): Promise<boolean> => {
  const { tableName } = migrationConfig;
  const lockTableName = getLockTableName(tableName);
  const startupLockTableName = getStartupLockTableName(tableName);

  const lockTableExists = await db.schema.hasTable(lockTableName);
  const startupLockTableExists = await db.schema.hasTable(startupLockTableName);

  if (!lockTableExists) {
    logger.debug("Migration tables not initialized");
    return false;
  }
  if (!startupLockTableExists) {
    logger.debug("Startup lock table not initialized");
    return false;
  }

  const lockRowCount = await db(lockTableName).count().first();
  const startupLockRowCount = await db(startupLockTableName).count().first();

  const isInitialized = (lockRowCount?.count as number) > 0 && (startupLockRowCount?.count as number) > 0;

  logger.debug(
    `Migration tables initialized, lock table: ${lockRowCount?.count}, startup lock table: ${startupLockRowCount?.count}`
  );
  return isInitialized;
};

const createStartupLockTable = async (tableName: string, db: Knex): Promise<void> => {
  await db.schema.createTable(tableName, (t) => {
    t.increments("index").primary();
    t.integer("is_locked");
    t.string("session_id").nullable();
    t.string("node").nullable();
    t.timestamp("heartbeat_updated_at").nullable();
  });
};

const insertStartupLockRowIfNeeded = async (tableName: string, db: Knex): Promise<void> => {
  const data: unknown[] = await db.select("*").from(tableName);
  if (!data.length) {
    await db.from(tableName).insert({ is_locked: 0 });
  }
};

const ensureStartupLockTable = async (db: Knex, logger: Logger): Promise<void> => {
  const { tableName } = migrationConfig;
  const startupLockTableName = getStartupLockTableName(tableName);

  const tableExists = await db.schema.hasTable(startupLockTableName);
  if (!tableExists) {
    await createStartupLockTable(startupLockTableName, db);
    logger.info(`Startup lock table created: ${startupLockTableName}`);
  }

  await insertStartupLockRowIfNeeded(startupLockTableName, db);
};

const ensureMigrationTables = async (db: Knex, logger: Logger): Promise<void> => {
  const isInitialized = await isMigrationInitialized(db, logger);
  if (isInitialized) {
    // Even if migration tables are initialized, ensure the startup lock table exists
    await ensureStartupLockTable(db, logger);
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
      // Ensure the startup lock table exists even if migration tables were already initialized
      await ensureStartupLockTable(tx, logger);
      return;
    }
    // The currentVersion will call ensureTable, end up creating the migration table, lock table,
    // and insert the first row into the lock table.
    await tx.migrate.currentVersion(migrationConfig);
    logger.info("Migration tables initialized");

    // Ensure the startup lock table is created and initialized
    await ensureStartupLockTable(tx, logger);
    logger.info("Startup lock table initialized");
  });
};

const withStartupLock = async (db: Knex, logger: Logger, doMigrations: () => Promise<void>): Promise<void> => {
  const { tableName } = migrationConfig;
  const startupLockTableName = getStartupLockTableName(tableName);

  const sessionId = crypto.randomUUID();
  const node = `${os.hostname()}-${process.pid}`;

  const ACQUIRE_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes timeout to acquire lock
  const HEARTBEAT_INTERVAL_MS = 5000; // Update heartbeat every 5 seconds
  const BASE_RETRY_DELAY_MS = 2000; // Base delay of 2 seconds between retries
  // Consider lock stale if heartbeat is older than 3x the heartbeat interval (15 seconds)
  const STALE_HEARTBEAT_THRESHOLD_MS = HEARTBEAT_INTERVAL_MS * 3;

  let lockAcquired = false;
  let heartbeatInterval: NodeJS.Timeout | null = null;

  const acquireLock = async (): Promise<boolean> => {
    const staleThreshold = new Date(Date.now() - STALE_HEARTBEAT_THRESHOLD_MS);
    const result = await db(startupLockTableName)
      // 1. is_locked = 0 (lock is free), OR
      .where({ is_locked: 0 })
      // 2. is_locked = 1 AND heartbeat is stale (previous instance crashed)
      .orWhere((qb) => {
        void qb.where({ is_locked: 1 }).andWhere((subQb) => {
          void subQb.whereNull("heartbeat_updated_at").orWhere("heartbeat_updated_at", "<", staleThreshold);
        });
      })
      .update({
        is_locked: 1,
        session_id: sessionId,
        node,
        heartbeat_updated_at: db.fn.now()
      });
    return result > 0;
  };

  const startHeartbeat = () => {
    heartbeatInterval = setInterval(() => {
      db(startupLockTableName)
        .where({ session_id: sessionId, node, is_locked: 1 })
        .update({
          heartbeat_updated_at: db.fn.now()
        })
        .catch((err) => {
          logger.error(err, "Failed to update heartbeat");
        });
    }, HEARTBEAT_INTERVAL_MS);
  };

  const stopHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  const releaseLock = async () => {
    try {
      await db(startupLockTableName).where({ session_id: sessionId, node, is_locked: 1 }).update({
        is_locked: 0,
        session_id: null,
        node: null,
        heartbeat_updated_at: null
      });
      logger.info(`Startup lock released [sessionId=${sessionId}] [node=${node}]`);
    } catch (err) {
      logger.error(err, "Failed to release startup lock");
    }
  };

  // Try to acquire the lock with timeout-based retries
  const acquireLockStartTime = Date.now();
  let attemptCount = 0;

  while (Date.now() - acquireLockStartTime < ACQUIRE_LOCK_TIMEOUT_MS) {
    attemptCount += 1;
    // eslint-disable-next-line no-await-in-loop -- Intentional retry loop with timeout
    lockAcquired = await acquireLock();

    if (lockAcquired) {
      const elapsedTime = Date.now() - acquireLockStartTime;
      logger.info(
        `Startup lock acquired [sessionId=${sessionId}] [node=${node}] [attempts=${attemptCount}] [elapsedTime=${elapsedTime}ms]`
      );
      break;
    }

    // Check if we still have time before timeout
    const elapsedTime = Date.now() - acquireLockStartTime;
    const remainingTime = ACQUIRE_LOCK_TIMEOUT_MS - elapsedTime;

    if (remainingTime <= 0) {
      break;
    }

    // Lock not acquired, wait with random jitter before retrying
    // Don't wait longer than the remaining timeout
    const retryDelay = Math.min(Math.floor(applyJitter(BASE_RETRY_DELAY_MS)), remainingTime);
    logger.debug(
      `Startup lock not available, retrying in ${retryDelay}ms [attempt=${attemptCount}] [elapsedTime=${elapsedTime}ms] [remainingTime=${remainingTime}ms] [node=${node}]`
    );
    // eslint-disable-next-line no-await-in-loop -- Intentional retry delay
    await delay(retryDelay);
  }

  if (!lockAcquired) {
    const elapsedTime = Date.now() - acquireLockStartTime;
    throw new Error(
      `Failed to acquire startup lock within ${ACQUIRE_LOCK_TIMEOUT_MS}ms timeout [attempts=${attemptCount}] [elapsedTime=${elapsedTime}ms]. Another instance may be running migrations.`
    );
  }

  startHeartbeat();
  try {
    // Run migrations while heartbeat is updating
    await doMigrations();
    logger.info("Migrations completed successfully");
  } finally {
    // Always stop heartbeat and release lock
    stopHeartbeat();
    await releaseLock();
  }
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

      // Use startup lock to ensure only one instance runs migrations at a time
      await withStartupLock(auditLogDb, logger, async () => {
        await auditLogDb.migrate.latest(migrationConfig);
      });
      logger.info("Finished audit log migrations.");
    }

    await ensureMigrationTables(applicationDb, logger);
    logger.info("Running application migrations.");
    const didPreviousInstanceRunMigration = !(await applicationDb.migrate
      .status(migrationConfig)
      .catch(migrationStatusCheckErrorHandler));
    if (didPreviousInstanceRunMigration) {
      logger.info("No application migrations pending: Applied by previous instance. Skipping migration process.");
      return;
    }

    // Use startup lock to ensure only one instance runs migrations at a time
    await withStartupLock(applicationDb, logger, async () => {
      await applicationDb.migrate.latest(migrationConfig);
    });
    logger.info("Finished application migrations.");
  } catch (err) {
    logger.error(err, "Boot up migration failed");
    process.exit(1);
  }
};
