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
  const appCfg = initEnvConfig(logger);

  const db = initDbConnection({
    dbConnectionUri: appCfg.DB_CONNECTION_URI,
    dbRootCert: appCfg.DB_ROOT_CERT,
    readReplicas: appCfg.DB_READ_REPLICAS?.map((el) => ({
      dbRootCert: el.DB_ROOT_CERT,
      dbConnectionUri: el.DB_CONNECTION_URI
    }))
  });

  const auditLogDb = appCfg.AUDIT_LOGS_DB_CONNECTION_URI
    ? initAuditLogDbConnection({
        dbConnectionUri: appCfg.AUDIT_LOGS_DB_CONNECTION_URI,
        dbRootCert: appCfg.AUDIT_LOGS_DB_ROOT_CERT
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

  const queue = queueServiceFactory(appCfg.REDIS_URL, {
    dbConnectionUrl: appCfg.DB_CONNECTION_URI,
    dbRootCert: appCfg.DB_ROOT_CERT
  });

  await queue.initialize();

  const keyStore = keyStoreFactory(appCfg.REDIS_URL);
  const redis = new Redis(appCfg.REDIS_URL);

  const hsmModule = initializeHsmModule();
  hsmModule.initialize();

  const server = await main({ db, auditLogDb, hsmModule: hsmModule.getModule(), smtp, logger, queue, keyStore, redis });
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
    port: appCfg.PORT,
    host: appCfg.HOST,
    listenTextResolver: (address) => {
      void bootstrap();
      return address;
    }
  });
};

void run();
