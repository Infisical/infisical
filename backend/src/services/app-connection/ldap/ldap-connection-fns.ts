import { isIP } from "node:net";

import ldap from "ldapjs";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { LdapConnectionMethod } from "./ldap-connection-enums";
import { TLdapConnectionConfig } from "./ldap-connection-types";

const LDAP_TIMEOUT = 15_000;

/**
 * Extracts the domain from the DC components of a Distinguished Name.
 * e.g. "dc=us,dc=test,dc=com" → "us.test.com"
 */
export const extractDomainFromDN = (dn: string): string | null => {
  if (!dn) return null;

  const dcComponents = dn
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.toLowerCase().startsWith("dc="))
    .map((part) => part.substring(3).toLowerCase());

  return dcComponents.length > 0 ? dcComponents.join(".") : null;
};

/**
 * Extracts the hostname from an LDAP referral URL.
 * e.g. "ldap://dc2.americas.test.com:389/CN=user,DC=americas,DC=test,DC=com" → "dc2.americas.test.com"
 */
export const extractHostFromReferralUrl = (referralUrl: string): string | null => {
  try {
    const url = new URL(referralUrl);
    return url.hostname || null;
  } catch {
    return null;
  }
};

export type LdapReferralError = Error & {
  dn: string;
  code: number;
  referrals: string[];
  referralSource?: "search" | "modify";
};

/**
 * Checks if an error is an LDAP Referral (code 10) without requiring `dn` to be populated.
 * Useful for search referrals where ldapjs sets `dn` to null.
 */
export const isLdapReferral = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const ldapErr = err as Error & { name?: string; code?: number };
  return ldapErr.name === "ReferralError" && ldapErr.code === 10;
};

/**
 * Type guard for a fully-formed LDAP Referral: code 10 with `dn` (string) and `referrals` (array).
 * `referrals` carries the actual target URLs from the LDAPResult, which is the primary source for determining the chase target.
 */
export const isLdapReferralError = (err: unknown): err is LdapReferralError => {
  if (!isLdapReferral(err)) return false;
  const ldapErr = err as Error & { dn?: unknown; code?: unknown; referrals?: unknown };
  return typeof ldapErr.dn === "string" && typeof ldapErr.code === "number" && Array.isArray(ldapErr.referrals);
};

const parseLdapUrl = (url: string): { protocol: string; host: string; port: number } => {
  const urlObj = new URL(url);
  const isSSL = urlObj.protocol === "ldaps:";
  const defaultPort = isSSL ? 636 : 389;

  return {
    protocol: urlObj.protocol.replace(":", ""),
    host: urlObj.hostname,
    port: urlObj.port ? parseInt(urlObj.port, 10) : defaultPort
  };
};

const constructLdapUrl = (protocol: string, host: string, port: number): string => {
  return `${protocol}://${host}:${port}`;
};

/**
 * Extracts the root domain (last two labels) from a hostname.
 * e.g. "dc1.test.com" → "test.com", "americas.infisical.local" → "infisical.local"
 * Returns null for IPs or single-label hostnames where a suffix check isn't meaningful.
 */
const getRootDomain = (hostname: string): string | null => {
  const parts = hostname.split(".");
  if (parts.length < 2) return null;
  if (isIP(hostname) !== 0) return null;
  return parts.slice(-2).join(".").toLowerCase();
};

/**
 * Constructs a new LDAP URL targeting a different domain/host,
 * preserving the protocol and port from the original URL.
 *
 * Validates that the target domain shares the same root domain as the original
 * host to prevent credential forwarding to attacker-controlled servers via
 * a crafted referral response.
 */
export const buildReferralUrl = (originalUrl: string, targetDomain: string): string => {
  const { protocol, host, port } = parseLdapUrl(originalUrl);

  if (isIP(targetDomain) !== 0) {
    throw new Error(
      `Referral target '${targetDomain}' is an IP address — legitimate AD referrals use FQDNs. Refusing to forward credentials`
    );
  }

  const originalRoot = getRootDomain(host);
  const targetRoot = getRootDomain(targetDomain);

  if (!originalRoot) {
    logger.warn(
      { originalHost: host, targetDomain },
      "Cannot validate referral domain boundary — original LDAP URL is not a FQDN"
    );
  } else if (!targetRoot || originalRoot !== targetRoot) {
    throw new Error(
      `Referral domain '${targetDomain}' is outside the trust boundary of '${host}' — refusing to forward credentials`
    );
  }

  return constructLdapUrl(protocol, targetDomain, port);
};

const setupLdapClientHandlers = <T>(
  client: ldap.Client,
  dn: string,
  password: string,
  onSuccess: (client: ldap.Client) => T | Promise<T>
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const handleError = (errorType: string, err: Error) => {
      logger.error(err, errorType);
      client.destroy();
      reject(new Error(`${errorType.replace("LDAP ", "")} - ${err.message}`));
    };

    client.on("error", (err: Error) => handleError("LDAP Error", err));
    client.on("connectError", (err: Error) => handleError("LDAP Connection Error", err));
    client.on("connectRefused", (err: Error) => handleError("LDAP Connection Refused", err));
    client.on("connectTimeout", (err: Error) => handleError("LDAP Connection Timeout", err));

    client.on("connect", () => {
      client.bind(dn, password, (err) => {
        if (err) {
          logger.error(err, "LDAP Bind Error");
          client.destroy();
          reject(new Error(`Bind Error: ${err.message}`));
          return;
        }

        try {
          const result = onSuccess(client);
          if (result instanceof Promise) {
            result.then((value) => resolve(value)).catch(reject);
          } else {
            resolve(result);
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  });
};

export const getLdapConnectionListItem = () => {
  return {
    name: "LDAP" as const,
    app: AppConnection.LDAP as const,
    methods: Object.values(LdapConnectionMethod) as [LdapConnectionMethod.SimpleBind]
  };
};

export const getLdapConnectionClient = async ({
  url,
  dn,
  password,
  sslCertificate,
  sslRejectUnauthorized = true
}: TLdapConnectionConfig["credentials"]) => {
  await blockLocalAndPrivateIpAddresses(url, false);

  const isSSL = url.startsWith("ldaps");

  const client = ldap.createClient({
    url,
    timeout: LDAP_TIMEOUT,
    connectTimeout: LDAP_TIMEOUT,
    tlsOptions: isSSL
      ? {
          rejectUnauthorized: sslRejectUnauthorized,
          ca: sslCertificate ? [sslCertificate] : undefined
        }
      : undefined
  });

  return setupLdapClientHandlers<ldap.Client>(client, dn, password, (ldapClient) => ldapClient);
};

export const executeWithPotentialGateway = async <T>(
  config: TLdapConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (client: ldap.Client) => Promise<T>
): Promise<T> => {
  const { gatewayId, credentials } = config;
  const { protocol, host, port } = parseLdapUrl(credentials.url);
  const appCfg = getConfig();

  if (gatewayId && gatewayV2Service) {
    await blockLocalAndPrivateIpAddresses(credentials.url, true);
    const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost: host,
      targetPort: port
    });

    if (!platformConnectionDetails) {
      throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
    }

    return withGatewayV2Proxy(
      async (proxyPort) => {
        const proxyUrl = constructLdapUrl(protocol, "localhost", proxyPort);
        const isSSL = protocol === "ldaps";

        const client = ldap.createClient({
          url: proxyUrl,
          timeout: LDAP_TIMEOUT,
          connectTimeout: LDAP_TIMEOUT,
          tlsOptions: isSSL
            ? {
                rejectUnauthorized: config.credentials.sslRejectUnauthorized,
                ca: config.credentials.sslCertificate ? [config.credentials.sslCertificate] : undefined,
                servername: host,
                // bypass hostname verification for development
                ...(appCfg.isDevelopmentMode ? { checkServerIdentity: () => undefined } : {})
              }
            : undefined
        });

        return setupLdapClientHandlers<T>(client, credentials.dn, credentials.password, async (ldapClient) => {
          try {
            return await operation(ldapClient);
          } finally {
            ldapClient.destroy();
          }
        });
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
        relayHost: platformConnectionDetails.relayHost,
        gateway: platformConnectionDetails.gateway,
        relay: platformConnectionDetails.relay
      }
    );
  }

  // Non-gateway path - calls getLdapConnectionClient which has validation
  const client = await getLdapConnectionClient(credentials);
  try {
    return await operation(client);
  } finally {
    client.destroy();
  }
};

export const validateLdapConnectionCredentials = async (
  config: TLdapConnectionConfig,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  try {
    await executeWithPotentialGateway(config, gatewayV2Service, async (client) => {
      // this shouldn't occur as handle connection error events in client but here as fallback
      if (!client.connected) {
        throw new BadRequestError({ message: "Unable to connect to LDAP server" });
      }
    });

    return config.credentials;
  } catch (error) {
    throw new BadRequestError({
      message: `Unable to validate connection: ${
        (error as Error)?.message?.replaceAll(config.credentials.password, "********************") ??
        "verify credentials"
      }`
    });
  }
};
