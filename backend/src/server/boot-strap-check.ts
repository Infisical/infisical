/* eslint-disable no-console */
import { Knex } from "knex";
import { createTransport } from "nodemailer";

import { formatSmtpConfig, getConfig } from "@app/lib/config/env";
import { buildRedisFromConfig } from "@app/lib/config/redis";
import { logger } from "@app/lib/logger";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";

type BootstrapOpt = {
  db: Knex;
};

const bootstrapCb = async () => {
  const appCfg = getConfig();
  const serverCfg = await getServerCfg();
  const portNote =
   "Note: If running in Docker, the exposed host port may differ from the port shown above.";
  if (!serverCfg.initialized) {
    console.info(`Welcome to Infisical

Create your Infisical administrator account at:
http://localhost:${appCfg.PORT}/admin/signup

${portNote}
`);
  } else {
    console.info(`Welcome back!

To access Infisical Administrator Panel open
http://localhost:${appCfg.PORT}/admin

To access Infisical server
http://localhost:${appCfg.PORT}

${portNote}
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
      console.info(`SMTP - Verified connection to ${appCfg.SMTP_HOST}:${appCfg.SMTP_PORT}`);
    })
    .catch((err: Error) => {
      console.error(`SMTP - Failed to connect to ${appCfg.SMTP_HOST}:${appCfg.SMTP_PORT} - ${err.message}`);
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
  const redis = buildRedisFromConfig(appCfg);
  const redisPing = await redis?.ping();
  if (!redisPing) {
    console.error("Redis - Failed to connect");
  } else {
    console.log("Redis successfully connected");
    if (appCfg.isRedisSentinelMode) {
      console.log("Redis Sentinel Mode");
    }
    redis.disconnect();
  }

  return bootstrapCb;
};
