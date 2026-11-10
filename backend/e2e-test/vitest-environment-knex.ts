// knex loads the .ts migrations and seeds with require(), which bypasses vitest's transformer.
import "tsx/cjs";

import dotenv from "dotenv";
import path from "path";

import "@app/lib/config/disable-sdk-platform-detection";
import { initDbConnection } from "@app/db";
import { seedData1 } from "@app/db/seed-data";
import { InstanceConfigCoreModule } from "@app/domains/platform/instance-config-core/ce/module";
import { keyValueStoreDALFactory } from "@app/keystore/key-value-store-dal";
import { keyStoreFactory } from "@app/keystore/keystore";
import { AuthMethod, AuthTokenType } from "@app/lib/auth/actor-types";
import { buildClickHouseFromConfig } from "@app/lib/config/clickhouse";
import { getDatabaseCredentials, initEnvConfig } from "@app/lib/config/env";
import { buildRedisFromConfig } from "@app/lib/config/redis";
import { crypto } from "@app/lib/crypto/cryptography";
import { initLogger } from "@app/lib/logger";
import { queueServiceFactory } from "@app/queue";
import { main } from "@app/server/app";
import { bootstrapCheck } from "@app/server/boot-strap-check";

import { mockSmtpServer } from "./mocks/smtp";

dotenv.config({ path: path.join(__dirname, "../../.env.test"), debug: true });
process.env.ALLOW_INTERNAL_IP_CONNECTIONS = "true";
export default {
  name: "knex-env",
  transformMode: "ssr",
  async setup() {
    const logger = initLogger();
    const databaseCredentials = getDatabaseCredentials(logger);

    const db = initDbConnection({
      dbConnectionUri: databaseCredentials.dbConnectionUri,
      dbRootCert: databaseCredentials.dbRootCert
    });

    const envCfg = await initEnvConfig(() => InstanceConfigCoreModule.readFipsSetting(db), logger);

    const redis = buildRedisFromConfig(envCfg);
    await redis.flushdb("SYNC");

    const clickhouseClient = buildClickHouseFromConfig(envCfg);

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
      const queue = queueServiceFactory(envCfg);
      const keyValueStoreDAL = keyValueStoreDALFactory(db);
      const keyStore = keyStoreFactory(envCfg, keyValueStoreDAL);

      const server = await main({
        db,
        smtp,
        logger,
        queue,
        keyStore,
        redis,
        clickhouse: clickhouseClient,
        envConfig: envCfg
      });

      await bootstrapCheck({ db });

      // @ts-expect-error type
      globalThis.testServer = server;
      // @ts-expect-error type
      globalThis.testSmtp = smtp;
      // @ts-expect-error type
      globalThis.testDb = db;
      // @ts-expect-error type
      globalThis.testRedis = redis;
      // @ts-expect-error type
      globalThis.testKeyStore = keyStore;
      // @ts-expect-error type
      globalThis.testQueue = queue;
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
        delete globalThis.testRedis;
        // @ts-expect-error type
        delete globalThis.testKeyStore;
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
