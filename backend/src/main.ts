import "./lib/config/disable-sdk-platform-detection";
// Note(Daniel): Do not rename this import, as it is strictly removed from FIPS standalone builds to avoid FIPS mode issues.
// If you rename the import, update the Dockerfile.fips.standalone-infisical file as well.
import "./lib/telemetry/instrumentation";
import "./lib/config/snowflake-sdk-ocsp";

import axios from "axios";
import dotenv from "dotenv";

import { keyValueStoreDALFactory } from "@app/keystore/key-value-store-dal";

import { runMigrations } from "./auto-start-migrations";
import { initAuditLogDbConnection, initDbConnection } from "./db";
import { keyStoreFactory } from "./keystore/keystore";
import { buildClickHouseFromConfig } from "./lib/config/clickhouse";
import { formatSmtpConfig, getDatabaseCredentials, initEnvConfig } from "./lib/config/env";
import { buildRedisFromConfig } from "./lib/config/redis";
import { axiosResponseInterceptor } from "./lib/config/request";
import { removeTemporaryBaseDirectory } from "./lib/files";
import { initLogger } from "./lib/logger";
import { CustomLogger } from "./lib/logger/logger";
import { registerInfrastructureMetrics } from "./lib/telemetry/metrics";
import { queueServiceFactory } from "./queue";
import { main } from "./server/app";
import { bootstrapCheck } from "./server/boot-strap-check";
import { smtpServiceFactory } from "./services/smtp/smtp-service";
import { superAdminDALFactory } from "./services/super-admin/super-admin-dal";

dotenv.config();

const setupAxiosResponseInterceptor = (logger: CustomLogger) => {
  axios.interceptors.response.use((response) => axiosResponseInterceptor(response, logger));
};

const run = async () => {
  const logger = initLogger();
  await removeTemporaryBaseDirectory();

  setupAxiosResponseInterceptor(logger);
  const databaseCredentials = getDatabaseCredentials(logger);

  const db = initDbConnection({
    dbConnectionUri: databaseCredentials.dbConnectionUri,
    dbRootCert: databaseCredentials.dbRootCert,
    readReplicas: databaseCredentials.readReplicas,
    pool: databaseCredentials.pool,
    replicaPool: databaseCredentials.replicaPool
  });

  // Register connection-pool and entity-count observable gauges. No-ops when telemetry is disabled.
  registerInfrastructureMetrics(db);

  const superAdminDAL = superAdminDALFactory(db);
  const envConfig = await initEnvConfig(superAdminDAL, logger);

  logger.info(
    `Running Infisical ${envConfig.INFISICAL_PLATFORM_VERSION ? `v${envConfig.INFISICAL_PLATFORM_VERSION}` : "Development Mode"}`
  );

  const auditLogDb = envConfig.AUDIT_LOGS_DB_CONNECTION_URI
    ? initAuditLogDbConnection({
        dbConnectionUri: envConfig.AUDIT_LOGS_DB_CONNECTION_URI,
        dbRootCert: envConfig.AUDIT_LOGS_DB_ROOT_CERT,
        pool: { min: envConfig.AUDIT_LOGS_DB_POOL_MIN, max: envConfig.AUDIT_LOGS_DB_POOL_MAX }
      })
    : undefined;

  const clickhouse = buildClickHouseFromConfig(envConfig);
  await runMigrations({
    applicationDb: db,
    auditLogDb,
    clickhouseClient: clickhouse,
    logger
  });

  const smtp = smtpServiceFactory(formatSmtpConfig());

  const queue = queueServiceFactory(envConfig);

  const keyValueStoreDAL = keyValueStoreDALFactory(db);
  const keyStore = keyStoreFactory(envConfig, keyValueStoreDAL);
  const redis = buildRedisFromConfig(envConfig, "app");

  const server = await main({
    db,
    auditLogDb,
    superAdminDAL,
    smtp,
    logger,
    queue,
    keyStore,
    redis,
    clickhouse,
    envConfig
  });

  const bootstrap = await bootstrapCheck({ db });

  // eslint-disable-next-line
  process.on("SIGINT", async () => {
    await server.close();
    await queue.shutdown();
    await db.destroy();
    await removeTemporaryBaseDirectory();
    process.exit(0);
  });

  // eslint-disable-next-line
  process.on("SIGTERM", async () => {
    await server.close();
    await queue.shutdown();
    await db.destroy();
    await removeTemporaryBaseDirectory();
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
