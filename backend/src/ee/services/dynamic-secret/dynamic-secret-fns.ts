import crypto from "node:crypto";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { getDbConnectionHost } from "@app/lib/knex";

export const verifyHostInputValidity = (host: string, isGateway = false) => {
  const appCfg = getConfig();
  const dbHost = appCfg.DB_HOST || getDbConnectionHost(appCfg.DB_CONNECTION_URI);
  // no need for validation when it's dev
  if (appCfg.NODE_ENV === "development") return;

  if (host === "host.docker.internal") throw new BadRequestError({ message: "Invalid db host" });

  if (
    appCfg.isCloud &&
    !isGateway &&
    // localhost
    // internal ips
    (host.match(/^10\.\d+\.\d+\.\d+/) || host.match(/^192\.168\.\d+\.\d+/))
  )
    throw new BadRequestError({ message: "Invalid db host" });

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    (dbHost?.length === host.length && crypto.timingSafeEqual(Buffer.from(dbHost || ""), Buffer.from(host)))
  ) {
    throw new BadRequestError({ message: "Invalid db host" });
  }
};
