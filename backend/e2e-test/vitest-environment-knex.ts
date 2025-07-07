// eslint-disable-next-line
import "ts-node/register";

import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import path from "path";

import { seedData1 } from "@app/db/seed-data";
import { initEnvConfig } from "@app/lib/config/env";
import { initLogger } from "@app/lib/logger";
import { main } from "@app/server/app";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

import { mockSmtpServer } from "./mocks/smtp";
import { initDbConnection } from "@app/db";
import { queueServiceFactory } from "@app/queue";
import { keyStoreFactory } from "@app/keystore/keystore";
import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";
import { buildRedisFromConfig } from "@app/lib/config/redis";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";
import { crypto } from "@app/lib/crypto/cryptography";

dotenv.config({ path: path.join(__dirname, "../../.env.test"), debug: true });
export default {
  name: "knex-env",
  transformMode: "ssr",
  async setup() {
    const logger = initLogger();
    const { envCfg, updateRootEncryptionKey } = initEnvConfig(logger);
    const db = initDbConnection({
      dbConnectionUri: envCfg.DB_CONNECTION_URI,
      dbRootCert: envCfg.DB_ROOT_CERT
    });
    const superAdminDAL = superAdminDALFactory(db);
    const fipsEnabled = await crypto.initialize(superAdminDAL);
    if (fipsEnabled) {
      updateRootEncryptionKey(envCfg.ENCRYPTION_KEY);
    }

    const redis = buildRedisFromConfig(envCfg);
    await redis.flushdb("SYNC");

    try {
      await db.migrate.rollback(
        {
          directory: path.join(__dirname, "../src/db/migrations"),
          extension: "ts",
          tableName: "infisical_migrations"
        },
        true
      );

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
      const queue = queueServiceFactory(envCfg, { dbConnectionUrl: envCfg.DB_CONNECTION_URI });
      const keyStore = keyStoreFactory(envCfg);

      const hsmModule = initializeHsmModule(envCfg);
      hsmModule.initialize();

      const server = await main({
        db,
        smtp,
        logger,
        queue,
        keyStore,
        hsmModule: hsmModule.getModule(),
        superAdminDAL,
        redis,
        envConfig: envCfg
      });

      // @ts-expect-error type
      globalThis.testServer = server;
      // @ts-expect-error type
      globalThis.testCryptoProvider = crypto;
      // @ts-expect-error type
      globalThis.jwtAuthToken = jwt.sign(
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
        await globalThis.testServer.close();
        // @ts-expect-error type
        delete globalThis.testServer;
        // @ts-expect-error type
        delete globalThis.jwtToken;
        // called after all tests with this env have been run
        await db.migrate.rollback(
          {
            directory: path.join(__dirname, "../src/db/migrations"),
            extension: "ts",
            tableName: "infisical_migrations"
          },
          true
        );

        await redis.flushdb("ASYNC");
        redis.disconnect();
        await db.destroy();
      }
    };
  }
};
