/* eslint-disable no-console */
import { Redis } from "ioredis";
import { Knex } from "knex";
import { createTransport } from "nodemailer";

import { formatSmtpConfig, getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";

type BootstrapOpt = {
  db: Knex;
};

const bootstrapCb = async () => {
  const appCfg = getConfig();
  const serverCfg = await getServerCfg();
  if (!serverCfg.initialized) {
    console.info(`Welcome to Infisical

Create your Infisical administrator account at:
http://localhost:${appCfg.PORT}/admin/signup
`);
  } else {
    console.info(`Welcome back!

To access Infisical Administrator Panel open
http://localhost:${appCfg.PORT}/admin

To access Infisical server
http://localhost:${appCfg.PORT}
`);
  }
};

export const bootstrapCheck = async ({ db }: BootstrapOpt) => {
  const appCfg = getConfig();
  if (appCfg.isDevelopmentMode) {
    console.log("Development mode. Skipping initial check");
    return bootstrapCb;
  }

  console.info("Checking configurations...");
  console.info("Testing smtp connection");

  const smtpCfg = formatSmtpConfig();
  await createTransport(smtpCfg)
    .verify()
    .then(async () => {
      console.info("SMTP successfully connected");
    })
    .catch((err) => {
      console.error(`SMTP - Failed to connect to ${appCfg.SMTP_HOST}:${appCfg.SMTP_PORT}`);
      logger.error(err);
    });

  console.log("Testing Postgres connection");
  await db
    .raw("SELECT NOW()")
    .then(() => {
      console.log("PostgreSQL - Connected successfully");
    })
    .catch((err) => {
      console.error("Failed to connect to PostgreSQL");
      logger.error(err);
    });

  console.log("Testing redis connection");
  const redis = new Redis(appCfg.REDIS_URL);
  const redisPing = await redis?.ping();
  if (!redisPing) {
    console.error("Redis - Failed to connect");
  } else {
    console.error("Redis successfully connected");
    redis.disconnect();
  }

  return bootstrapCb;
};
