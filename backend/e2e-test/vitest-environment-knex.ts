// eslint-disable-next-line
import "ts-node/register";

import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import knex from "knex";
import path from "path";

import { seedData1 } from "@app/db/seed-data";
import { initEnvConfig } from "@app/lib/config/env";
import { initLogger } from "@app/lib/logger";
import { main } from "@app/server/app";
import { AuthTokenType } from "@app/services/auth/auth-type";

import { mockQueue } from "./mocks/queue";
import { mockSmtpServer } from "./mocks/smtp";

dotenv.config({ path: path.join(__dirname, "../../.env.test"), debug: true });
export default {
  name: "knex-env",
  transformMode: "ssr",
  async setup() {
    const logger = await initLogger();
    const cfg = initEnvConfig(logger);
    const db = knex({
      client: "pg",
      connection: cfg.DB_CONNECTION_URI,
      migrations: {
        directory: path.join(__dirname, "../src/db/migrations"),
        extension: "ts",
        tableName: "infisical_migrations"
      },
      seeds: {
        directory: path.join(__dirname, "../src/db/seeds"),
        extension: "ts"
      }
    });

    try {
      await db.migrate.latest();
      await db.seed.run();
      const smtp = mockSmtpServer();
      const queue = mockQueue();
      const server = await main({ db, smtp, logger, queue });
      // @ts-expect-error type
      globalThis.testServer = server;
      // @ts-expect-error type
      globalThis.jwtAuthToken = jwt.sign(
        {
          authTokenType: AuthTokenType.ACCESS_TOKEN,
          userId: seedData1.id,
          tokenVersionId: seedData1.token.id,
          accessVersion: 1
        },
        cfg.AUTH_SECRET,
        { expiresIn: cfg.JWT_AUTH_LIFETIME }
      );
    } catch (error) {
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
        await db.migrate.rollback({}, true);
        await db.destroy();
      }
    };
  }
};
