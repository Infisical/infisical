import dns from "node:dns/promises";
import net from "node:net";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { isPrivateIp } from "@app/lib/ip/ipRange";
import { getDbConnectionHost } from "@app/lib/knex";

export const verifyHostInputValidity = async ({
  host,
  isDynamicSecret,
  isGateway
}: {
  host: string;
  isDynamicSecret: boolean;
  isGateway?: boolean;
}) => {
  const appCfg = getConfig();

  if (appCfg.isDevelopmentMode || appCfg.isTestMode) return [host];

  if (isGateway) return [host];

  const reservedHosts = [appCfg.DB_HOST || getDbConnectionHost(appCfg.DB_CONNECTION_URI)].concat(
    (appCfg.DB_READ_REPLICAS || []).map((el) => getDbConnectionHost(el.DB_CONNECTION_URI)),
    getDbConnectionHost(appCfg.REDIS_URL),
    getDbConnectionHost(appCfg.AUDIT_LOGS_DB_CONNECTION_URI)
  );

  // get host db ip
  const exclusiveIps: string[] = [];
  for await (const el of reservedHosts) {
    if (el) {
      if (net.isIPv4(el)) {
        exclusiveIps.push(el);
      } else {
        try {
          const resolvedIps = await dns.resolve4(el);
          exclusiveIps.push(...resolvedIps);
        } catch (error) {
          // only try lookup if not found
          if ((error as { code: string })?.code !== "ENOTFOUND") throw error;

          const resolvedIps = (await dns.lookup(el, { all: true, family: 4 })).map(({ address }) => address);
          exclusiveIps.push(...resolvedIps);
        }
      }
    }
  }

  const normalizedHost = host.split(":")[0].toLowerCase();
  const inputHostIps: string[] = [];
  if (net.isIPv4(host)) {
    inputHostIps.push(host);
  } else {
    if (!appCfg.DYNAMIC_SECRET_ALLOW_INTERNAL_IP && !appCfg.ALLOW_INTERNAL_IP_CONNECTIONS) {
      if (normalizedHost === "localhost" || normalizedHost === "host.docker.internal") {
        throw new BadRequestError({
          message: `Local host IP addresses (${normalizedHost}) are not allowed.${!appCfg.isCloud ? ` If you are self-hosting, you can allow local host IP addresses by setting the '${isDynamicSecret ? "'DYNAMIC_SECRET_ALLOW_INTERNAL_IP'" : "'ALLOW_INTERNAL_IP_CONNECTIONS'"}' environment variable to 'true' on your instance.` : ""}`
        });
      }
    }
    try {
      const resolvedIps = await dns.resolve4(host);
      inputHostIps.push(...resolvedIps);
    } catch (error) {
      // only try lookup if not found
      if ((error as { code: string })?.code !== "ENOTFOUND") throw error;

      const resolvedIps = (await dns.lookup(host, { all: true, family: 4 })).map(({ address }) => address);
      inputHostIps.push(...resolvedIps);
    }
  }

  if (!(appCfg.DYNAMIC_SECRET_ALLOW_INTERNAL_IP || appCfg.ALLOW_INTERNAL_IP_CONNECTIONS)) {
    const isInternalIp = inputHostIps.some((el) => isPrivateIp(el));
    if (isInternalIp)
      throw new BadRequestError({
        message: `Private IP addresses (${normalizedHost}) are not allowed.${!appCfg.isCloud ? ` If you are self-hosting, you can allow private IP addresses by setting the '${isDynamicSecret ? "'DYNAMIC_SECRET_ALLOW_INTERNAL_IP'" : "'ALLOW_INTERNAL_IP_CONNECTIONS'"}' environment variable to 'true' on your instance.` : ""}`
      });
  }

  const isAppUsedIps = inputHostIps.some((el) => exclusiveIps.includes(el));
  if (isAppUsedIps)
    throw new BadRequestError({
      message: `The host ${host} belongs to a service that is in-use by Infisical, such as the Infisical database or Redis instance. You cannot use hosts that are in-use by Infisical.`
    });
  return inputHostIps;
};
