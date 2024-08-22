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

import { mockQueue } from "./mocks/queue";
import { mockSmtpServer } from "./mocks/smtp";
import { mockKeyStore } from "./mocks/keystore";
import { initDbConnection } from "@app/db";

dotenv.config({ path: path.join(__dirname, "../../.env.test"), debug: true });
export default {
  name: "knex-env",
  transformMode: "ssr",
  async setup() {
    const logger = await initLogger();
    const cfg = initEnvConfig(logger);
    const db = initDbConnection({
      dbConnectionUri: cfg.DB_CONNECTION_URI,
      dbRootCert: cfg.DB_ROOT_CERT
    });

    try {
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
      const queue = mockQueue();
      const keyStore = mockKeyStore();
      const server = await main({ db, smtp, logger, queue, keyStore });
      // @ts-expect-error type
      globalThis.testServer = server;
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
        cfg.AUTH_SECRET,
        { expiresIn: cfg.JWT_AUTH_LIFETIME }
      );
    } catch (error) {
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
        await db.destroy();
      }
    };
  }
};
