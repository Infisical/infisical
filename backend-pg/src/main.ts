import dotenv from "dotenv";

import { formatSmtpConfig, initEnvConfig } from "./lib/config/env";
import { initLogger } from "./lib/logger";
import { main } from "./server/app";
import { smtpServiceFactory } from "./services/smtp/smtp-service";
import { initDbConnection } from "./db";

dotenv.config();
const run = async () => {
  const logger = await initLogger();
  const appCfg = initEnvConfig(logger);
  const db = initDbConnection(appCfg.DB_CONNECTION_URI);
  const smtp = smtpServiceFactory(formatSmtpConfig());

  const server = await main({ db, smtp, logger });
  process.on("SIGINT", async () => {
    await server.close();
    await db.destroy();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await server.close();
    await db.destroy();
    process.exit(0);
  });

  await server.listen({ port: appCfg.PORT, host: appCfg.HOST });
};

run();
