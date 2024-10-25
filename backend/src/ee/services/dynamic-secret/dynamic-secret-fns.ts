import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { getDbConnectionHost } from "@app/lib/knex";

export const verifyHostInputValidity = (host: string) => {
  const appCfg = getConfig();
  const dbHost = appCfg.DB_HOST || getDbConnectionHost(appCfg.DB_CONNECTION_URI);

  if (
    appCfg.isCloud &&
    // localhost
    // internal ips
    (host === "host.docker.internal" || host.match(/^10\.\d+\.\d+\.\d+/) || host.match(/^192\.168\.\d+\.\d+/))
  )
    throw new BadRequestError({ message: "Invalid db host" });

  if (host === "localhost" || host === "127.0.0.1" || dbHost === host) {
    throw new BadRequestError({ message: "Invalid db host" });
  }
};
