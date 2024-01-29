import dotenv from "dotenv";

import { initDbConnection } from "./db";
import { formatSmtpConfig, initEnvConfig } from "./lib/config/env";
import { initLogger } from "./lib/logger";
import { queueServiceFactory } from "./queue";
import { main } from "./server/app";
import { bootstrapCheck } from "./server/boot-strap-check";
import { smtpServiceFactory } from "./services/smtp/smtp-service";

dotenv.config();
const run = async () => {
  const logger = await initLogger();
  const appCfg = initEnvConfig(logger);
  const db = initDbConnection(appCfg.DB_CONNECTION_URI);
  const smtp = smtpServiceFactory(formatSmtpConfig());
  const queue = queueServiceFactory(appCfg.REDIS_URL);

  const server = await main({ db, smtp, logger, queue });
  const bootstrap = await bootstrapCheck({ db });
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

  server.listen({
    port: appCfg.PORT,
    host: appCfg.HOST,
    listenTextResolver: (address) => {
      bootstrap();
      return address;
    }
  });
};

run();
