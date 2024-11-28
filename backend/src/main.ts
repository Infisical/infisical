import "./lib/telemetry/instrumentation";

import dotenv from "dotenv";
import { Redis } from "ioredis";
import path from "path";

import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";

import { initAuditLogDbConnection, initDbConnection } from "./db";
import { keyStoreFactory } from "./keystore/keystore";
import { formatSmtpConfig, initEnvConfig, IS_PACKAGED } from "./lib/config/env";
import { isMigrationMode } from "./lib/fn";
import { initLogger } from "./lib/logger";
import { queueServiceFactory } from "./queue";
import { main } from "./server/app";
import { bootstrapCheck } from "./server/boot-strap-check";
import { smtpServiceFactory } from "./services/smtp/smtp-service";

dotenv.config();

const run = async () => {
  const logger = await initLogger();
  const envConfig = initEnvConfig(logger);

  const db = initDbConnection({
    dbConnectionUri: envConfig.DB_CONNECTION_URI,
    dbRootCert: envConfig.DB_ROOT_CERT,
    readReplicas: envConfig.DB_READ_REPLICAS?.map((el) => ({
      dbRootCert: el.DB_ROOT_CERT,
      dbConnectionUri: el.DB_CONNECTION_URI
    }))
  });

  const auditLogDb = envConfig.AUDIT_LOGS_DB_CONNECTION_URI
    ? initAuditLogDbConnection({
        dbConnectionUri: envConfig.AUDIT_LOGS_DB_CONNECTION_URI,
        dbRootCert: envConfig.AUDIT_LOGS_DB_ROOT_CERT
      })
    : undefined;

  // Case: App is running in packaged mode (binary), and migration mode is enabled.
  // Run the migrations and exit the process after completion.
  if (IS_PACKAGED && isMigrationMode()) {
    try {
      logger.info("Running Postgres migrations..");
      await db.migrate.latest({
        directory: path.join(__dirname, "./db/migrations")
      });
      logger.info("Postgres migrations completed");
    } catch (err) {
      logger.error(err, "Failed to run migrations");
      process.exit(1);
    }

    process.exit(0);
  }

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
