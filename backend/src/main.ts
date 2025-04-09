import "./lib/telemetry/instrumentation";

import dotenv from "dotenv";
import { Redis } from "ioredis";

import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";

import { runMigrations } from "./auto-start-migrations";
import { clickUpAuditLogDbConnection, initAuditLogDbConnection, initDbConnection } from "./db";
import { keyStoreFactory } from "./keystore/keystore";
import { formatSmtpConfig, initEnvConfig } from "./lib/config/env";
import { initLogger } from "./lib/logger";
import { queueServiceFactory } from "./queue";
import { main } from "./server/app";
import { bootstrapCheck } from "./server/boot-strap-check";
import { smtpServiceFactory } from "./services/smtp/smtp-service";

dotenv.config();

const run = async () => {
  const logger = initLogger();
  const envConfig = initEnvConfig(logger);

  const db = initDbConnection({
    dbConnectionUri: envConfig.DB_CONNECTION_URI,
    dbRootCert: envConfig.DB_ROOT_CERT,
    readReplicas: envConfig.DB_READ_REPLICAS?.map((el) => ({
      dbRootCert: el.DB_ROOT_CERT,
      dbConnectionUri: el.DB_CONNECTION_URI
    }))
  });

  let auditLogDb;

  switch (envConfig.SHOULD_USE_AUDIT_LOG_DB) {
    case "POSTGRES":
      auditLogDb =
        envConfig.SHOULD_USE_AUDIT_LOG_DB === "POSTGRES" && envConfig.AUDIT_LOGS_DB_CONNECTION_URI
          ? initAuditLogDbConnection({
              dbConnectionUri: envConfig.AUDIT_LOGS_DB_CONNECTION_URI,
              dbRootCert: envConfig.AUDIT_LOGS_DB_ROOT_CERT
            })
          : undefined;

      break;
    case "CLICKHOUSE":
      auditLogDb =
        envConfig.SHOULD_USE_AUDIT_LOG_DB === "CLICKHOUSE" && envConfig.CLICKHOUSE_DB_CONNECTION_URI
          ? clickUpAuditLogDbConnection({
              dbConnectionUri: envConfig.CLICKHOUSE_DB_CONNECTION_URI,
              dbConnectionPassword: envConfig.CLICKHOUSE_DB_PASSWORD,
              dbConnectionUser: envConfig.CLICKHOUSE_DB_USER
            })
          : undefined;
      break;
    default:
      auditLogDb = undefined;
      break;
  }

  await runMigrations({ applicationDb: db, auditLogDb, logger });

  const smtp = smtpServiceFactory(formatSmtpConfig());

  const queue = queueServiceFactory(envConfig.REDIS_URL, {
    dbConnectionUrl: envConfig.DB_CONNECTION_URI,
    dbRootCert: envConfig.DB_ROOT_CERT
  });

  await queue.initialize();

  const keyStore = keyStoreFactory(envConfig.REDIS_URL);
  const redis = new Redis(envConfig.REDIS_URL);

  const hsmModule = initializeHsmModule(envConfig);
  hsmModule.initialize();

  const server = await main({
    db,
    auditLogDb,
    hsmModule: hsmModule.getModule(),
    smtp,
    logger,
    queue,
    keyStore,
    redis,
    envConfig
  });
  const bootstrap = await bootstrapCheck({ db });

  // eslint-disable-next-line
  process.on("SIGINT", async () => {
    await server.close();
    await db.destroy();
    hsmModule.finalize();
    process.exit(0);
  });

  // eslint-disable-next-line
  process.on("SIGTERM", async () => {
    await server.close();
    await db.destroy();
    hsmModule.finalize();
    process.exit(0);
  });

  process.on("uncaughtException", (error) => {
    logger.error(error, "CRITICAL ERROR: Uncaught Exception");
  });

  process.on("unhandledRejection", (error) => {
    logger.error(error, "CRITICAL ERROR: Unhandled Promise Rejection");
  });

  await server.listen({
    port: envConfig.PORT,
    host: envConfig.HOST,
    listenTextResolver: (address) => {
      void bootstrap();
      return address;
    }
  });
};

void run();
