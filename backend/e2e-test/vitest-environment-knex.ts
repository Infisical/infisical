// eslint-disable-next-line
import "ts-node/register";

import dotenv from "dotenv";
import { crypto } from "@app/lib/crypto/cryptography";
import path from "path";

import { seedData1 } from "@app/db/seed-data";
import { getDatabaseCredentials, getHsmConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger } from "@app/lib/logger";
import { main } from "@app/server/app";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

import { mockSmtpServer } from "./mocks/smtp";
import { initDbConnection } from "@app/db";
import { queueServiceFactory } from "@app/queue";
import { keyStoreFactory } from "@app/keystore/keystore";
import { keyValueStoreDALFactory } from "@app/keystore/key-value-store-dal";
import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";
import { buildRedisFromConfig } from "@app/lib/config/redis";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";
import { bootstrapCheck } from "@app/server/boot-strap-check";
import { hsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { queueJobsDALFactory } from "@app/queue/queue-jobs-dal";

dotenv.config({ path: path.join(__dirname, "../../.env.test"), debug: true });
export default {
  name: "knex-env",
  transformMode: "ssr",
  async setup() {
    const logger = initLogger();
    const databaseCredentials = getDatabaseCredentials(logger);
    const hsmConfig = getHsmConfig(logger);

    const db = initDbConnection({
      dbConnectionUri: databaseCredentials.dbConnectionUri,
      dbRootCert: databaseCredentials.dbRootCert
    });

    const superAdminDAL = superAdminDALFactory(db);
    const kmsRootConfigDAL = kmsRootConfigDALFactory(db);

    const hsmModule = initializeHsmModule(hsmConfig);
    hsmModule.initialize();

    const hsmService = hsmServiceFactory({
      hsmModule: hsmModule.getModule(),
      envConfig: hsmConfig
    });

    await hsmService.startService();

    const envCfg = await initEnvConfig(hsmService, kmsRootConfigDAL, superAdminDAL, logger);

    const redis = buildRedisFromConfig(envCfg);
    await redis.flushdb("SYNC");

    try {
      // called after all tests with this env have been run
      await db.raw("DROP SCHEMA IF EXISTS public CASCADE");
      await db.schema.createSchemaIfNotExists("public");

      await db.migrate.latest({
        directory: path.join(__dirname, "../src/db/migrations"),
        extension: "ts",
        tableName: "infisical_migrations"
      });

      await db.seed.run({
        directory: path.join(__dirname, "../src/db/seeds"),
        extension: "ts"
      });

      const smtp = mockSmtpServer();
      const queueJobsDAL = queueJobsDALFactory(db);
      const queue = queueServiceFactory(envCfg, queueJobsDAL, { dbConnectionUrl: envCfg.DB_CONNECTION_URI });
      const keyValueStoreDAL = keyValueStoreDALFactory(db);
      const keyStore = keyStoreFactory(envCfg, keyValueStoreDAL);

      await queue.initialize();

      const server = await main({
        db,
        smtp,
        logger,
        queue,
        keyStore,
        hsmService,
        kmsRootConfigDAL,
        superAdminDAL,
        redis,
        envConfig: envCfg
      });

      await bootstrapCheck({ db });

      // @ts-expect-error type
      globalThis.testServer = server;
      // @ts-expect-error type
      globalThis.testQueue = queue;
      // @ts-expect-error type
      globalThis.testSuperAdminDAL = superAdminDAL;
      // @ts-expect-error type
      globalThis.testKmsRootConfigDAL = kmsRootConfigDAL;
      // @ts-expect-error type
      globalThis.testHsmService = hsmService;
      // @ts-expect-error type
      globalThis.jwtAuthToken = crypto.jwt().sign(
        {
          authTokenType: AuthTokenType.ACCESS_TOKEN,
          userId: seedData1.id,
          tokenVersionId: seedData1.token.id,
          authMethod: AuthMethod.EMAIL,
          organizationId: seedData1.organization.id,
          accessVersion: 1
        },
        envCfg.AUTH_SECRET,
        { expiresIn: envCfg.JWT_AUTH_LIFETIME }
      );
    } catch (error) {
      // eslint-disable-next-line
      console.log("[TEST] Error setting up environment", error);
      await db.destroy();
      throw error;
    }

    // custom setup
    return {
      async teardown() {
        // @ts-expect-error type
        await globalThis.testQueue.shutdown();
        // @ts-expect-error type
        await globalThis.testServer.close();
        // @ts-expect-error type
        delete globalThis.testServer;
        // @ts-expect-error type
        delete globalThis.testSuperAdminDAL;
        // @ts-expect-error type
        delete globalThis.jwtAuthToken;
        // @ts-expect-error type
        delete globalThis.testQueue;

        await redis.flushdb("ASYNC");
        redis.disconnect();
        await db.destroy();
      }
    };
  }
};
