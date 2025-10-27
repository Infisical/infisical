// Note(Daniel): Do not rename this import, as it is strictly removed from FIPS standalone builds to avoid FIPS mode issues.
// If you rename the import, update the Dockerfile.fips.standalone-infisical file as well.
import "./lib/telemetry/instrumentation";

import dotenv from "dotenv";

import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";
import { keyValueStoreDALFactory } from "@app/keystore/key-value-store-dal";

import { runMigrations } from "./auto-start-migrations";
import { initAuditLogDbConnection, initDbConnection } from "./db";
import { hsmServiceFactory } from "./ee/services/hsm/hsm-service";
import { keyStoreFactory } from "./keystore/keystore";
import { formatSmtpConfig, getDatabaseCredentials, getHsmConfig, initEnvConfig } from "./lib/config/env";
import { buildRedisFromConfig } from "./lib/config/redis";
import { removeTemporaryBaseDirectory } from "./lib/files";
import { initLogger } from "./lib/logger";
import { queueServiceFactory } from "./queue";
import { main, markServerReady } from "./server/app";
import { bootstrapCheck } from "./server/boot-strap-check";
import { kmsRootConfigDALFactory } from "./services/kms/kms-root-config-dal";
import { smtpServiceFactory } from "./services/smtp/smtp-service";
import { superAdminDALFactory } from "./services/super-admin/super-admin-dal";

dotenv.config();

const run = async () => {
  const logger = initLogger();
  await removeTemporaryBaseDirectory();

  const hsmConfig = getHsmConfig(logger);

  const hsmModule = initializeHsmModule(hsmConfig);
  hsmModule.initialize();

  const hsmService = hsmServiceFactory({
    hsmModule: hsmModule.getModule(),
    envConfig: hsmConfig
  });

  await hsmService.startService();

  const databaseCredentials = getDatabaseCredentials(logger);

  const db = initDbConnection({
    dbConnectionUri: databaseCredentials.dbConnectionUri,
    dbRootCert: databaseCredentials.dbRootCert,
    readReplicas: databaseCredentials.readReplicas
  });

  const superAdminDAL = superAdminDALFactory(db);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(db);
  const envConfig = await initEnvConfig(hsmService, kmsRootConfigDAL, superAdminDAL, logger);

  const auditLogDb = envConfig.AUDIT_LOGS_DB_CONNECTION_URI
    ? initAuditLogDbConnection({
        dbConnectionUri: envConfig.AUDIT_LOGS_DB_CONNECTION_URI,
        dbRootCert: envConfig.AUDIT_LOGS_DB_ROOT_CERT
      })
    : undefined;

  const smtp = smtpServiceFactory(formatSmtpConfig());

  const queue = queueServiceFactory(envConfig, {
    dbConnectionUrl: envConfig.DB_CONNECTION_URI,
    dbRootCert: envConfig.DB_ROOT_CERT
  });

  await queue.initialize();

  const keyValueStoreDAL = keyValueStoreDALFactory(db);
  const keyStore = keyStoreFactory(envConfig, keyValueStoreDAL);
  const redis = buildRedisFromConfig(envConfig);

  const server = await main({
    db,
    auditLogDb,
    superAdminDAL,
    kmsRootConfigDAL,
    hsmService,
    smtp,
    logger,
    queue,
    keyStore,
    redis,
    envConfig
  });

  // Setup signal handlers
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

  // Start listening BEFORE migrations
  // At this point: /api/health returns 200, /api/ready returns 503
  await server.listen({
    port: envConfig.PORT,
    host: envConfig.HOST
  });

  logger.info(`Server listening on ${envConfig.HOST}:${envConfig.PORT}`);
  logger.info("Running migrations - health check available, other endpoints blocked...");

  // Run migrations while server is up
  await runMigrations({ applicationDb: db, auditLogDb, logger });

  logger.info("Migrations complete. Marking server as ready...");

  // Mark server as ready - now all endpoints work
  markServerReady();

  logger.info("Server is ready to accept traffic");

  const bootstrap = await bootstrapCheck({ db });
  void bootstrap();
};

void run();
