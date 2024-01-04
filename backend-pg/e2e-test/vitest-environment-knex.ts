// import { main } from "@app/server/app";
import { initEnvConfig } from "@app/lib/config/env";
import dotenv from "dotenv";
import knex from "knex";
import path from "path";
import { mockSmtpServer } from "./mocks/smtp";
import { initLogger } from "@app/lib/logger";

import "ts-node/register";
import { main } from "@app/server/app";
import { mockQueue } from "./mocks/queue";

dotenv.config({ path: path.join(__dirname, "../.env.test") });
export default {
  name: "knex-env",
  transformMode: "ssr",
  async setup() {
    const db = knex({
      client: "pg",
      connection: process.env.DB_CONNECTION_URI,
      migrations: {
        directory: path.join(__dirname, "../src/db/migrations"),
        extension: "ts"
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
      const logger = await initLogger();
      initEnvConfig(logger);
      const server = await main({ db, smtp, logger, queue });
      // @ts-expect-error type
      globalThis.testServer = server;
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
        // called after all tests with this env have been run
        await db.migrate.rollback({}, true);
        await db.destroy();
      }
    };
  }
};
