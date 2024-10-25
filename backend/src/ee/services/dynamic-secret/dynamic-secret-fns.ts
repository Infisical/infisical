import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";

export const verifyHostInputValidity = (host: string) => {
  const appCfg = getConfig();

  if (
    appCfg.isCloud &&
    // localhost
    // internal ips
    (host === "host.docker.internal" || host.match(/^10\.\d+\.\d+\.\d+/) || host.match(/^192\.168\.\d+\.\d+/))
  )
    throw new BadRequestError({ message: "Invalid db host" });

  if (host === "localhost" || host === "127.0.0.1") {
    throw new BadRequestError({ message: "Invalid db host" });
  }
};
