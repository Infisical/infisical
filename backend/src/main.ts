// Note(Daniel): Do not rename this import, as it is strictly removed from FIPS standalone builds to avoid FIPS mode issues.
// If you rename the import, update the Dockerfile.fips.standalone-infisical file as well.
import "./lib/telemetry/instrumentation";

import dotenv from "dotenv";

import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";

import { runMigrations } from "./auto-start-migrations";
import { initAuditLogDbConnection, initDbConnection } from "./db";
import { keyStoreFactory } from "./keystore/keystore";
import { formatSmtpConfig, getDatabaseCredentials, initEnvConfig } from "./lib/config/env";
import { buildRedisFromConfig } from "./lib/config/redis";
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
  await removeTemporaryBaseDirectory();

  const databaseCredentials = getDatabaseCredentials(logger);

  const db = initDbConnection({
    dbConnectionUri: databaseCredentials.dbConnectionUri,
    dbRootCert: databaseCredentials.dbRootCert,
    readReplicas: databaseCredentials.readReplicas
  });

  const superAdminDAL = superAdminDALFactory(db);
  const envConfig = await initEnvConfig(superAdminDAL, logger);

  const auditLogDb = envConfig.AUDIT_LOGS_DB_CONNECTION_URI
    ? initAuditLogDbConnection({
        dbConnectionUri: envConfig.AUDIT_LOGS_DB_CONNECTION_URI,
        dbRootCert: envConfig.AUDIT_LOGS_DB_ROOT_CERT
      })
    : undefined;

  await runMigrations({ applicationDb: db, auditLogDb, logger });

  const smtp = smtpServiceFactory(formatSmtpConfig());

  const queue = queueServiceFactory(envConfig, {
    dbConnectionUrl: envConfig.DB_CONNECTION_URI,
    dbRootCert: envConfig.DB_ROOT_CERT
  });

  await queue.initialize();

  const keyStore = keyStoreFactory(envConfig);
  const redis = buildRedisFromConfig(envConfig);

  const hsmModule = initializeHsmModule(envConfig);
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
    envConfig
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

  if (!envConfig.isDevelopmentMode) {
    process.on("uncaughtException", (error) => {
      logger.error(error, "CRITICAL ERROR: Uncaught Exception");
    });

    process.on("unhandledRejection", (error) => {
      logger.error(error, "CRITICAL ERROR: Unhandled Promise Rejection");
    });
  }

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
