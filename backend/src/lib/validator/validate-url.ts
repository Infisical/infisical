import { getConfig } from "../config/env";
import { BadRequestError } from "../errors";

export const blockLocalAndPrivateIpAddresses = (url: string) => {
  const validUrl = new URL(url);
  const appCfg = getConfig();
  // on cloud local ips are not allowed
  if (
    appCfg.isCloud &&
    (validUrl.host === "host.docker.internal" ||
      validUrl.host.match(/^10\.\d+\.\d+\.\d+/) ||
      validUrl.host.match(/^192\.168\.\d+\.\d+/))
  )
    throw new BadRequestError({ message: "Local IPs not allowed as URL" });

  if (validUrl.host === "localhost" || validUrl.host === "127.0.0.1")
    throw new BadRequestError({ message: "Localhost not allowed" });
};
