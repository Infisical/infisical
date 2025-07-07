import "./lib/telemetry/instrumentation";

import dotenv from "dotenv";

import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";

import { runMigrations } from "./auto-start-migrations";
import { initAuditLogDbConnection, initDbConnection } from "./db";
import { keyStoreFactory } from "./keystore/keystore";
import { formatSmtpConfig, initEnvConfig } from "./lib/config/env";
import { buildRedisFromConfig } from "./lib/config/redis";
import { crypto } from "./lib/crypto/cryptography";
import { removeTemporaryBaseDirectory } from "./lib/files";
import { initLogger } from "./lib/logger";
import { queueServiceFactory } from "./queue";
import { main } from "./server/app";
import { bootstrapCheck } from "./server/boot-strap-check";
import { smtpServiceFactory } from "./services/smtp/smtp-service";
import { superAdminDALFactory } from "./services/super-admin/super-admin-dal";

dotenv.config();

const run = async () => {
  const logger = initLogger();
  const { envCfg, updateRootEncryptionKey } = initEnvConfig(logger);

  await removeTemporaryBaseDirectory();

  const db = initDbConnection({
    dbConnectionUri: envCfg.DB_CONNECTION_URI,
    dbRootCert: envCfg.DB_ROOT_CERT,
    readReplicas: envCfg.DB_READ_REPLICAS?.map((el) => ({
      dbRootCert: el.DB_ROOT_CERT,
      dbConnectionUri: el.DB_CONNECTION_URI
    }))
  });

  const superAdminDAL = superAdminDALFactory(db);
  const fipsEnabled = await crypto.initialize(superAdminDAL);
  if (fipsEnabled) {
    updateRootEncryptionKey(envCfg.ENCRYPTION_KEY);
  }

  const auditLogDb = envCfg.AUDIT_LOGS_DB_CONNECTION_URI
    ? initAuditLogDbConnection({
        dbConnectionUri: envCfg.AUDIT_LOGS_DB_CONNECTION_URI,
        dbRootCert: envCfg.AUDIT_LOGS_DB_ROOT_CERT
      })
    : undefined;

  await runMigrations({ applicationDb: db, auditLogDb, logger });

  const smtp = smtpServiceFactory(formatSmtpConfig());

  const queue = queueServiceFactory(envCfg, {
    dbConnectionUrl: envCfg.DB_CONNECTION_URI,
    dbRootCert: envCfg.DB_ROOT_CERT
  });

  await queue.initialize();

  const keyStore = keyStoreFactory(envCfg);
  const redis = buildRedisFromConfig(envCfg);

  const hsmModule = initializeHsmModule(envCfg);
  hsmModule.initialize();

  const server = await main({
    db,
    auditLogDb,
    superAdminDAL,
    hsmModule: hsmModule.getModule(),
    smtp,
    logger,
    queue,
    keyStore,
    redis,
    envConfig: envCfg
  });
  const bootstrap = await bootstrapCheck({ db });

  // eslint-disable-next-line
  process.on("SIGINT", async () => {
    await server.close();
    await queue.shutdown();
    await db.destroy();
    await removeTemporaryBaseDirectory();
    hsmModule.finalize();
    process.exit(0);
  });

  // eslint-disable-next-line
  process.on("SIGTERM", async () => {
    await server.close();
    await queue.shutdown();
    await db.destroy();
    await removeTemporaryBaseDirectory();
    hsmModule.finalize();
    process.exit(0);
  });

  if (!envCfg.isDevelopmentMode) {
    process.on("uncaughtException", (error) => {
      logger.error(error, "CRITICAL ERROR: Uncaught Exception");
    });

    process.on("unhandledRejection", (error) => {
      logger.error(error, "CRITICAL ERROR: Unhandled Promise Rejection");
    });
  }

  await server.listen({
    port: envCfg.PORT,
    host: envCfg.HOST,
    listenTextResolver: (address) => {
      void bootstrap();
      return address;
    }
  });
};

void run();
