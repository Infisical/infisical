import dns from "node:dns/promises";
import net from "node:net";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { isPrivateIp } from "@app/lib/ip/ipRange";
import { getDbConnectionHost } from "@app/lib/knex";

// The services Infisical itself runs on. A user-supplied host that resolves to one of these would
// point Infisical at its own database, cache, or log store.
const getReservedIps = async () => {
  const appCfg = getConfig();
  const reservedHosts = [appCfg.DB_HOST || getDbConnectionHost(appCfg.DB_CONNECTION_URI)].concat(
    (appCfg.DB_READ_REPLICAS || []).map((el) => getDbConnectionHost(el.DB_CONNECTION_URI)),
    getDbConnectionHost(appCfg.REDIS_URL),
    getDbConnectionHost(appCfg.CLICKHOUSE_URL),
    getDbConnectionHost(appCfg.AUDIT_LOGS_DB_CONNECTION_URI)
  );

  const exclusiveIps: string[] = [];
  for await (const el of reservedHosts) {
    if (el) {
      if (net.isIP(el)) {
        exclusiveIps.push(el);
      } else {
        const resolvedIps = (await dns.lookup(el, { all: true })).map(({ address }) => address);
        exclusiveIps.push(...resolvedIps);
      }
    }
  }
  return exclusiveIps;
};

// For hosts that are legitimately private, such as a gateway's own listen address, where the
// private-IP block in verifyHostInputValidity would reject the entire feature. Infisical's own
// infrastructure is still off limits: a gateway naming it would have the platform dial itself.
export const assertHostNotInfisicalInfrastructure = async ({ host }: { host: string }) => {
  const appCfg = getConfig();
  if (appCfg.isDevelopmentMode || appCfg.isTestMode) return;

  const exclusiveIps = await getReservedIps();
  if (!exclusiveIps.length) return;

  let hostIps: string[];
  if (net.isIP(host)) {
    hostIps = [host];
  } else {
    try {
      hostIps = (await dns.lookup(host, { all: true })).map(({ address }) => address);
    } catch {
      // An address that does not resolve yet is allowed through: a gateway is often registered
      // before its DNS record exists, and an unresolvable host cannot reach anything either way.
      return;
    }
  }

  if (hostIps.some((el) => exclusiveIps.includes(el))) {
    throw new BadRequestError({
      message:
        "The host belongs to a service that is in-use by Infisical, such as the Infisical database or Redis instance. You cannot use hosts that are in-use by Infisical."
    });
  }
};

export const verifyHostInputValidity = async ({
  host,
  isDynamicSecret,
  isGateway,
  preResolvedIps
}: {
  host: string;
  isDynamicSecret: boolean;
  isGateway?: boolean;
  preResolvedIps?: string[];
}) => {
  const appCfg = getConfig();

  if (appCfg.isDevelopmentMode || appCfg.isTestMode) return [host];

  if (isGateway) return [host];

  const exclusiveIps = await getReservedIps();

  const normalizedHost = host.split(":")[0].toLowerCase();
  let inputHostIps: string[];
  if (preResolvedIps) {
    inputHostIps = preResolvedIps;
  } else {
    inputHostIps = [];
    if (net.isIP(host)) {
      inputHostIps.push(host);
    } else {
      if (!appCfg.DYNAMIC_SECRET_ALLOW_INTERNAL_IP && !appCfg.ALLOW_INTERNAL_IP_CONNECTIONS) {
        if (normalizedHost === "localhost" || normalizedHost === "host.docker.internal") {
          throw new BadRequestError({
            message: `Local host IP addresses (${normalizedHost}) are not allowed.${!appCfg.isCloud ? ` If you are self-hosting, you can allow local host IP addresses by setting the '${isDynamicSecret ? "'DYNAMIC_SECRET_ALLOW_INTERNAL_IP'" : "'ALLOW_INTERNAL_IP_CONNECTIONS'"}' environment variable to 'true' on your instance.` : ""}`
          });
        }
      }
      const resolvedIps = (await dns.lookup(host, { all: true })).map(({ address }) => address);
      inputHostIps.push(...resolvedIps);
    }

    if (!(appCfg.DYNAMIC_SECRET_ALLOW_INTERNAL_IP || appCfg.ALLOW_INTERNAL_IP_CONNECTIONS)) {
      const isInternalIp = inputHostIps.some((el) => isPrivateIp(el));
      if (isInternalIp)
        throw new BadRequestError({
          message: `Private IP addresses (${normalizedHost}) are not allowed.${!appCfg.isCloud ? ` If you are self-hosting, you can allow private IP addresses by setting the '${isDynamicSecret ? "'DYNAMIC_SECRET_ALLOW_INTERNAL_IP'" : "'ALLOW_INTERNAL_IP_CONNECTIONS'"}' environment variable to 'true' on your instance.` : ""}`
        });
    }
  }

  const isAppUsedIps = inputHostIps.some((el) => exclusiveIps.includes(el));
  if (isAppUsedIps)
    throw new BadRequestError({
      message: `The host ${host} belongs to a service that is in-use by Infisical, such as the Infisical database or Redis instance. You cannot use hosts that are in-use by Infisical.`
    });
  return inputHostIps;
};
