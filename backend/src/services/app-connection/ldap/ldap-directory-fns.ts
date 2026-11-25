import ldap from "@infisical/ldapjs";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { BadRequestError, GatewayTimeoutError } from "@app/lib/errors";
import {
  buildDomainBaseDN,
  buildSidEqualityFilter,
  escapeLdapFilterValue,
  getLdapAttribute,
  getLdapAttributeBuffer,
  getLdapAttributeBuffers,
  isLdapSearchTimeout,
  netbiosFromDomainFqdn,
  searchLdap,
  TLdapSearchOptions
} from "@app/lib/ldap/ldap-search-fns";
import { logger } from "@app/lib/logger";
import { UserPrincipalNameRegex } from "@app/lib/regex";
import { sidBufferToString } from "@app/lib/windows-sid/windows-sid-fns";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { LdapProvider } from "./ldap-connection-enums";
import { executeWithPotentialGateway, extractDomainFromDN } from "./ldap-connection-fns";
import { TLdapConnectionConfig } from "./ldap-connection-types";

type TLdapGatewayServices = {
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

export type TLdapDirectoryGatewayServices = Pick<TLdapGatewayServices, "gatewayV2Service" | "gatewayPoolService">;

export type TDirectoryMachine = {
  hostname: string;
};

type TDirectoryComputer = {
  dnsHostName: string | null;
  isDisabled: boolean | null;
  samAccountName: string;
};

type TDirectoryGroup = {
  sid: string;
  name: string;
};

const LDAP_SEARCH_TIME_LIMIT_SECONDS = 15;
export const DIRECTORY_MACHINE_LIST_DEFAULT_LIMIT = 50;
export const DIRECTORY_MACHINE_LIST_MAX_LIMIT = 200;
const DIRECTORY_GROUP_LIST_LIMIT = 50;
const USER_ACCOUNT_CONTROL_ACCOUNT_DISABLED = 0x2;
const SECURITY_GROUP_FILTER = "(objectCategory=group)(groupType:1.2.840.113556.1.4.803:=2147483648)";

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
      isLdapSearchTimeout({ err, status })
        ? new GatewayTimeoutError({
            message: `The directory did not answer within ${LDAP_SEARCH_TIME_LIMIT_SECONDS} seconds.`,
            error: err
          })
        : new BadRequestError({
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

export const assertLdapProviderIsSupported = (
  provider: string | undefined,
  connectionName: string,
  requirement = "Certificate syncs read machine and account attributes that only Active Directory provides, so they require an Active Directory connection."
) => {
  if (provider !== undefined && provider !== LdapProvider.ActiveDirectory) {
    throw new BadRequestError({
      message: `The LDAP connection '${connectionName}' uses the '${provider}' provider. ${requirement}`
    });
  }
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

  assertLdapProviderIsSupported((connection.credentials as { provider?: string }).provider, connection.name);

  const username = await resolveLdapHostLogin(config, gatewayServices);

  return { host, username, password: config.credentials.password };
};

const searchDomain = async (
  config: TLdapConnectionConfig,
  gatewayServices: TLdapDirectoryGatewayServices,
  options: Pick<TLdapSearchOptions, "filter" | "attributes" | "sizeLimit">
) => {
  const { domainFqdn } = parseLdapBindIdentity(config.credentials.dn);
  const fallbackBaseDN = buildDomainBaseDN(domainFqdn);

  return executeWithPotentialGateway(
    config,
    gatewayServices.gatewayV2Service,
    async (client) => {
      const baseDN =
        (await readDefaultNamingContext(client).catch((err: unknown) => {
          logger.warn({ err }, `Unable to read the directory's naming context [domain=${domainFqdn}]`);
          return null;
        })) ?? fallbackBaseDN;

      return searchDirectory(client, baseDN, options);
    },
    gatewayServices.gatewayPoolService
  );
};

export const listDirectoryMachines = async (
  {
    config,
    search,
    limit = DIRECTORY_MACHINE_LIST_DEFAULT_LIMIT
  }: { config: TLdapConnectionConfig; search?: string; limit?: number },
  gatewayServices: TLdapGatewayServices
): Promise<TDirectoryMachine[]> => {
  const escapedSearch = search ? escapeLdapFilterValue(search) : undefined;
  const entries = await searchDomain(config, gatewayServices, {
    filter: escapedSearch
      ? `(&(objectCategory=computer)(|(cn=${escapedSearch}*)(dNSHostName=${escapedSearch}*)))`
      : "(objectCategory=computer)",
    attributes: ["cn", "dNSHostName"],
    sizeLimit: Math.min(limit, DIRECTORY_MACHINE_LIST_MAX_LIMIT)
  });

  return entries
    .map((entry) => ({ hostname: getLdapAttribute(entry, "dNSHostName") || getLdapAttribute(entry, "cn") }))
    .filter(({ hostname }) => hostname);
};

const toDirectoryGroup = (entry: ldap.SearchEntry): TDirectoryGroup[] => {
  const sid = getLdapAttributeBuffer(entry, "objectSid");
  return sid ? [{ sid: sidBufferToString(sid), name: getLdapAttribute(entry, "cn") }] : [];
};

export const readAccountDisabledFlag = (userAccountControl: string) => {
  const flags = Number(userAccountControl);
  if (!userAccountControl.trim() || !Number.isSafeInteger(flags)) return null;
  // eslint-disable-next-line no-bitwise
  return (flags & USER_ACCOUNT_CONTROL_ACCOUNT_DISABLED) !== 0;
};

export const findDirectoryComputerBySid = async (
  { config, sid }: { config: TLdapConnectionConfig; sid: string },
  gatewayServices: TLdapDirectoryGatewayServices
): Promise<TDirectoryComputer | null> => {
  const [entry] = await searchDomain(config, gatewayServices, {
    filter: new ldap.AndFilter({
      filters: [
        new ldap.EqualityFilter({ attribute: "objectCategory", value: "computer" }),
        buildSidEqualityFilter(sid)
      ]
    }),
    attributes: ["dNSHostName", "userAccountControl", "sAMAccountName"],
    sizeLimit: 1
  });
  if (!entry) return null;

  return {
    dnsHostName: getLdapAttribute(entry, "dNSHostName") || null,
    isDisabled: readAccountDisabledFlag(getLdapAttribute(entry, "userAccountControl")),
    samAccountName: getLdapAttribute(entry, "sAMAccountName")
  };
};

export const withActiveDirectoryErrors =
  (connection: { id: string; name: string }) =>
  (err: unknown): never => {
    if (err instanceof LdapTargetConfigurationError) throw err;
    logger.warn({ err }, `Unable to search Active Directory [connectionId=${connection.id}]`);
    if (err instanceof GatewayTimeoutError) {
      throw new GatewayTimeoutError({
        message: `Could not search Active Directory with the LDAP connection '${connection.name}': ${err.message} Try again.`,
        error: err
      });
    }
    const details = err instanceof BadRequestError ? ` Details: ${err.message}` : "";
    throw new BadRequestError({
      message: `Could not search Active Directory with the LDAP connection '${connection.name}'. Check that the directory is reachable and the connection's credentials are valid.${details}`
    });
  };

export const searchDirectoryGroups = async (
  { config, search }: { config: TLdapConnectionConfig; search?: string },
  gatewayServices: TLdapDirectoryGatewayServices
): Promise<{ groups: TDirectoryGroup[]; isTruncated: boolean }> => {
  const escapedSearch = search ? escapeLdapFilterValue(search) : undefined;
  const entries = await searchDomain(config, gatewayServices, {
    filter: escapedSearch
      ? `(&${SECURITY_GROUP_FILTER}(|(cn=*${escapedSearch}*)(sAMAccountName=*${escapedSearch}*)))`
      : `(&${SECURITY_GROUP_FILTER})`,
    attributes: ["cn", "objectSid"],
    sizeLimit: DIRECTORY_GROUP_LIST_LIMIT + 1
  });

  return {
    groups: entries.slice(0, DIRECTORY_GROUP_LIST_LIMIT).flatMap(toDirectoryGroup),
    isTruncated: entries.length > DIRECTORY_GROUP_LIST_LIMIT
  };
};

export const resolveDirectorySecurityGroupNames = async (
  { config, sids }: { config: TLdapConnectionConfig; sids: string[] },
  gatewayServices: TLdapDirectoryGatewayServices
): Promise<Record<string, string | null>> => {
  const entries = await searchDomain(config, gatewayServices, {
    filter: new ldap.AndFilter({
      filters: [
        ldap.parseFilter(`(&${SECURITY_GROUP_FILTER})`),
        new ldap.OrFilter({ filters: sids.map(buildSidEqualityFilter) })
      ]
    }),
    attributes: ["cn", "objectSid"],
    sizeLimit: sids.length
  });
  const namesBySid = new Map(entries.flatMap(toDirectoryGroup).map((group) => [group.sid, group.name]));

  return Object.fromEntries(sids.map((sid) => [sid, namesBySid.get(sid) ?? null]));
};

export const readDirectoryComputerGroupSids = async (
  { config, sid }: { config: TLdapConnectionConfig; sid: string },
  gatewayServices: TLdapDirectoryGatewayServices
): Promise<string[] | null> => {
  const { domainFqdn } = parseLdapBindIdentity(config.credentials.dn);

  return executeWithPotentialGateway(
    config,
    gatewayServices.gatewayV2Service,
    async (client) => {
      const baseDN =
        (await readDefaultNamingContext(client).catch((err: unknown) => {
          logger.warn({ err }, `Unable to read the directory's naming context [domain=${domainFqdn}]`);
          return null;
        })) ?? buildDomainBaseDN(domainFqdn);

      const [computer] = await searchDirectory(client, baseDN, {
        filter: new ldap.AndFilter({
          filters: [
            new ldap.EqualityFilter({ attribute: "objectCategory", value: "computer" }),
            buildSidEqualityFilter(sid)
          ]
        }),
        attributes: ["distinguishedName"],
        sizeLimit: 1
      });
      const distinguishedName = computer ? getLdapAttribute(computer, "distinguishedName") : "";
      if (!distinguishedName) return null;

      const [groups] = await searchDirectory(client, distinguishedName, {
        filter: "(objectClass=*)",
        attributes: ["tokenGroups"],
        scope: "base",
        sizeLimit: 1
      });
      return groups ? getLdapAttributeBuffers(groups, "tokenGroups").map(sidBufferToString) : [];
    },
    gatewayServices.gatewayPoolService
  );
};
