import ldap from "@infisical/ldapjs";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { BadRequestError } from "@app/lib/errors";
import {
  buildDomainBaseDN,
  escapeLdapFilterValue,
  getLdapAttribute,
  netbiosFromDomainFqdn,
  searchLdap,
  TLdapSearchOptions
} from "@app/lib/ldap/ldap-search-fns";
import { logger } from "@app/lib/logger";
import { UserPrincipalNameRegex } from "@app/lib/regex";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { executeWithPotentialGateway, extractDomainFromDN } from "./ldap-connection-fns";
import { TLdapConnectionConfig } from "./ldap-connection-types";

type TLdapGatewayServices = {
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

export type TDirectoryMachine = {
  hostname: string;
};

const LDAP_SEARCH_TIME_LIMIT_SECONDS = 15;
export const DIRECTORY_MACHINE_LIST_DEFAULT_LIMIT = 50;
export const DIRECTORY_MACHINE_LIST_MAX_LIMIT = 200;

const searchDirectory = (
  client: ldap.Client,
  baseDN: string,
  options: Pick<TLdapSearchOptions, "filter" | "attributes" | "scope" | "sizeLimit">
) =>
  searchLdap(client, {
    ...options,
    baseDN,
    timeLimitSeconds: LDAP_SEARCH_TIME_LIMIT_SECONDS,
    acceptSizeLimitExceeded: true,
    mapError: ({ err, status }) =>
      new BadRequestError({
        message: err
          ? `Unable to read from the directory: ${err.message}`
          : `Unable to read from the directory: the LDAP server returned status ${status}`
      })
  });

type TBindIdentity = {
  domainFqdn: string;
  accountName: string | null;
};

export class LdapTargetConfigurationError extends BadRequestError {}

export const parseLdapBindIdentity = (dn: string): TBindIdentity => {
  const trimmed = dn.trim();

  if (UserPrincipalNameRegex.test(trimmed)) {
    const separator = trimmed.lastIndexOf("@");
    return {
      domainFqdn: trimmed.slice(separator + 1).toLowerCase(),
      accountName: trimmed.slice(0, separator)
    };
  }

  const domainFqdn = extractDomainFromDN(trimmed);
  if (!domainFqdn) {
    throw new LdapTargetConfigurationError({
      message:
        "Unable to determine the domain from the LDAP connection's DN. Use a distinguished name containing DC components, or a user principal name like user@domain.com"
    });
  }

  return { domainFqdn, accountName: null };
};

const readNetbiosDomainName = async (client: ldap.Client, baseDN: string): Promise<string | null> => {
  const entries = await searchDirectory(client, `CN=Partitions,CN=Configuration,${baseDN}`, {
    filter: `(&(objectClass=crossRef)(nETBIOSName=*)(nCName=${escapeLdapFilterValue(baseDN)}))`,
    attributes: ["nETBIOSName"],
    sizeLimit: 1
  });

  return entries.length ? getLdapAttribute(entries[0], "nETBIOSName") || null : null;
};

const readDefaultNamingContext = async (client: ldap.Client): Promise<string | null> => {
  const entries = await searchDirectory(client, "", {
    filter: "(objectClass=*)",
    attributes: ["defaultNamingContext"],
    scope: "base",
    sizeLimit: 1
  });

  return entries.length ? getLdapAttribute(entries[0], "defaultNamingContext") || null : null;
};

const netbiosFromBaseDN = (baseDN: string): string => baseDN.split(",")[0]?.split("=")[1]?.toUpperCase() || "";

const readAccountName = async (client: ldap.Client, dn: string): Promise<string | null> => {
  const entries = await searchDirectory(client, dn, {
    filter: "(objectClass=*)",
    attributes: ["sAMAccountName"],
    scope: "base",
    sizeLimit: 1
  });

  return entries.length ? getLdapAttribute(entries[0], "sAMAccountName") || null : null;
};

const readAccountNameByUpn = async (client: ldap.Client, baseDN: string, upn: string): Promise<string | null> => {
  const entries = await searchDirectory(client, baseDN, {
    filter: `(&(objectCategory=person)(userPrincipalName=${escapeLdapFilterValue(upn)}))`,
    attributes: ["sAMAccountName"],
    sizeLimit: 1
  });

  return entries.length ? getLdapAttribute(entries[0], "sAMAccountName") || null : null;
};

type TLdapHostLogin = {
  username: string;
  isGuessed: boolean;
};

const resolveHostLoginFromDirectory = async (
  config: TLdapConnectionConfig,
  gatewayServices: TLdapGatewayServices
): Promise<TLdapHostLogin> => {
  const { domainFqdn, accountName } = parseLdapBindIdentity(config.credentials.dn);
  const fallbackBaseDN = buildDomainBaseDN(domainFqdn);

  const resolved = await executeWithPotentialGateway(
    config,
    gatewayServices.gatewayV2Service,
    async (client) => {
      const baseDN =
        (await readDefaultNamingContext(client).catch((err: unknown) => {
          logger.warn({ err }, `Unable to read the directory's naming context [domain=${domainFqdn}]`);
          return null;
        })) ?? fallbackBaseDN;

      const [resolvedAccountName, netbiosDomainName] = await Promise.all([
        accountName
          ? readAccountNameByUpn(client, baseDN, config.credentials.dn).catch((err: unknown) => {
              logger.warn(
                { err },
                `Unable to read the account name for the bind UPN, using its local part [domain=${domainFqdn}]`
              );
              return null;
            })
          : readAccountName(client, config.credentials.dn).catch((err: unknown) => {
              logger.warn({ err }, `Unable to read the account name from the directory [domain=${domainFqdn}]`);
              return null;
            }),
        readNetbiosDomainName(client, baseDN).catch((err: unknown) => {
          logger.warn({ err }, `Unable to read the NetBIOS domain name from the directory [domain=${domainFqdn}]`);
          return null;
        })
      ]);
      return { netbiosDomainName, resolvedAccountName, baseDN };
    },
    gatewayServices.gatewayPoolService
  );

  const loginAccountName = resolved.resolvedAccountName ?? accountName;

  if (!loginAccountName) {
    throw new LdapTargetConfigurationError({
      message: `Unable to read the account name of "${config.credentials.dn}" from the directory. Set the LDAP connection's DN to a user principal name like user@${domainFqdn} instead`
    });
  }

  return {
    username: `${resolved.netbiosDomainName ?? netbiosFromBaseDN(resolved.baseDN) ?? netbiosFromDomainFqdn(domainFqdn)}\\${loginAccountName}`,
    isGuessed: !resolved.netbiosDomainName || !resolved.resolvedAccountName
  };
};

const buildHostLoginFingerprint = (config: TLdapConnectionConfig) =>
  [
    config.orgId,
    config.credentials.dn.trim().toLowerCase(),
    config.credentials.url.trim().toLowerCase(),
    config.gatewayId ?? "",
    config.gatewayPoolId ?? ""
  ].join("|");

const resolveLdapHostLogin = async (
  config: TLdapConnectionConfig,
  gatewayServices: TLdapGatewayServices
): Promise<string> => {
  const { username } = await withCache<TLdapHostLogin>({
    keyStore: gatewayServices.keyStore,
    key: KeyStorePrefixes.LdapHostLogin(buildHostLoginFingerprint(config)),
    ttlSeconds: (result) =>
      result.isGuessed ? KeyStoreTtls.LdapGuessedHostLoginInSeconds : KeyStoreTtls.LdapHostLoginInSeconds,
    fetcher: () => resolveHostLoginFromDirectory(config, gatewayServices)
  });

  return username;
};

export const resolveLdapBackedHostCredentials = async (
  {
    connection,
    host
  }: {
    connection: {
      name: string;
      method?: string;
      credentials: Record<string, unknown>;
      gatewayId?: string;
      gatewayPoolId?: string | null;
      orgId: string;
    };
    host: string | undefined;
  },
  gatewayServices: TLdapGatewayServices
): Promise<{ host: string; username: string; password: string }> => {
  if (!host) {
    throw new LdapTargetConfigurationError({
      message: `This sync uses the LDAP connection "${connection.name}", so it needs a target host. Set the target host on the sync to the machine it should deliver to.`
    });
  }

  const config = {
    app: AppConnection.LDAP,
    method: connection.method,
    credentials: connection.credentials,
    gatewayId: connection.gatewayId,
    gatewayPoolId: connection.gatewayPoolId,
    orgId: connection.orgId
  } as unknown as TLdapConnectionConfig;

  const username = await resolveLdapHostLogin(config, gatewayServices);

  return { host, username, password: config.credentials.password };
};

export const listDirectoryMachines = async (
  {
    config,
    search,
    limit = DIRECTORY_MACHINE_LIST_DEFAULT_LIMIT
  }: { config: TLdapConnectionConfig; search?: string; limit?: number },
  gatewayServices: TLdapGatewayServices
): Promise<TDirectoryMachine[]> => {
  const { domainFqdn } = parseLdapBindIdentity(config.credentials.dn);
  const fallbackBaseDN = buildDomainBaseDN(domainFqdn);
  const cappedLimit = Math.min(limit, DIRECTORY_MACHINE_LIST_MAX_LIMIT);

  const escapedSearch = search ? escapeLdapFilterValue(search) : undefined;
  const filter = escapedSearch
    ? `(&(objectCategory=computer)(|(cn=${escapedSearch}*)(dNSHostName=${escapedSearch}*)))`
    : "(objectCategory=computer)";

  const entries = await executeWithPotentialGateway(
    config,
    gatewayServices.gatewayV2Service,
    async (client) => {
      const baseDN =
        (await readDefaultNamingContext(client).catch((err: unknown) => {
          logger.warn({ err }, `Unable to read the directory's naming context [domain=${domainFqdn}]`);
          return null;
        })) ?? fallbackBaseDN;

      return searchDirectory(client, baseDN, {
        filter,
        attributes: ["cn", "dNSHostName"],
        sizeLimit: cappedLimit
      });
    },
    gatewayServices.gatewayPoolService
  );

  return entries
    .map((entry) => ({ hostname: getLdapAttribute(entry, "dNSHostName") || getLdapAttribute(entry, "cn") }))
    .filter(({ hostname }) => hostname);
};
