import net from "node:net";

import { Knex } from "knex";
import ldapjs from "ldapjs";
import RE2 from "re2";
import { runPowershell } from "winrm-client";

import { TPamAccountDependenciesDALFactory } from "@app/ee/services/pam-discovery/pam-account-dependencies-dal";
import { TPamDiscoveryScanDeps } from "@app/ee/services/pam-discovery/pam-discovery-factory";
import { TPamDiscoverySourceDependenciesDALFactory } from "@app/ee/services/pam-discovery/pam-discovery-source-dependencies-dal";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { verifyHostInputValidity } from "../../dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { TPamAccountDALFactory } from "../../pam-account/pam-account-dal";
import { encryptAccountCredentials } from "../../pam-account/pam-account-fns";
import {
  TActiveDirectoryAccountCredentials,
  TActiveDirectoryAccountInternalMetadata,
  TActiveDirectoryResourceConnectionDetails
} from "../../pam-resource/active-directory/active-directory-resource-types";
import { TPamResourceDALFactory } from "../../pam-resource/pam-resource-dal";
import { PamResource } from "../../pam-resource/pam-resource-enums";
import { encryptResourceConnectionDetails, encryptResourceInternalMetadata } from "../../pam-resource/pam-resource-fns";
import { resolveDnsTcp } from "../../pam-resource/shared/dns-over-dc";
import { WindowsAccountType, WindowsProtocol } from "../../pam-resource/windows-server/windows-server-resource-enums";
import {
  TWindowsAccountCredentials,
  TWindowsAccountMetadata,
  TWindowsResourceConnectionDetails,
  TWindowsResourceInternalMetadata
} from "../../pam-resource/windows-server/windows-server-resource-types";
import {
  PamAccountDependencySource,
  PamAccountDependencyType,
  PamDiscoverySourceRunStatus,
  PamDiscoverySourceRunTrigger,
  PamDiscoveryStepStatus
} from "../pam-discovery-enums";
import { TPamDiscoveryFactory } from "../pam-discovery-types";
import { DEPENDENCY_ENUMERATION_SCRIPT } from "./active-directory-discovery-scripts";
import {
  TActiveDirectoryDiscoverySourceConfiguration as TAdDiscoveryConfiguration,
  TActiveDirectoryDiscoverySourceCredentials as TAdDiscoveryCredentials,
  TActiveDirectoryDiscoverySourceRunProgress
} from "./active-directory-discovery-types";

const LDAP_TIMEOUT = 30 * 1000;
const LDAP_PAGE_SIZE = 500;
const SERVICE_ACCOUNT_PATTERNS = [new RE2(/^svc[_-]/i), new RE2(/[_-]service$/i), new RE2(/[_-]svc$/i)];
const BUILTIN_SERVICE_ACCOUNTS = new Set([
  "localsystem",
  "nt authority\\localservice",
  "nt authority\\networkservice",
  "nt authority\\system"
]);

type TWinRmLocalUser = {
  Name: string;
  Enabled: boolean;
  LastLogon: string | null;
  PasswordLastSet: string | null;
  Description: string;
  SID: { Value: string };
};

type TWinRmService = {
  Name: string;
  DisplayName: string;
  State: string;
  StartMode: string;
  StartName: string;
  ProcessId: number | null;
  PathName: string | null;
  Description: string | null;
};

type TWinRmScheduledTask = {
  TaskName: string;
  TaskPath: string;
  State: string;
  UserId: string;
  LogonType: string;
  RunLevel: string;
  LastRunTime: string | null;
  NextRunTime: string | null;
  LastTaskResult: number | null;
  Triggers: TWinRmTaskTrigger[] | null;
  Actions: TWinRmTaskAction[] | null;
};

type TWinRmTaskTrigger = {
  Type: string;
  StartBoundary: string | null;
  Interval: number | null;
};

type TWinRmTaskAction = {
  Type: string;
  Execute: string | null;
  Arguments: string | null;
};

type TWinRmIisAppPool = {
  Name: string;
  State: string;
  IdentityType: string;
  Username: string;
  ManagedRuntimeVersion: string | null;
  ManagedPipelineMode: string | null;
  AutoStart: boolean | null;
};

type TWinRmDependencies = {
  services: TWinRmService[];
  scheduledTasks: TWinRmScheduledTask[];
  iisAppPools: TWinRmIisAppPool[];
};

type TLdapComputer = {
  cn: string;
  dNSHostName: string;
  operatingSystem: string;
  operatingSystemVersion: string;
  objectGUID: string;
  whenChanged: string;
  resolvedIp?: string;
};

type TLdapUser = {
  sAMAccountName: string;
  userPrincipalName: string;
  objectGUID: string;
  displayName: string;
  servicePrincipalName: string | string[];
  memberOf: string | string[];
  pwdLastSet: string;
  userAccountControl: string;
  lastLogonTimestamp: string;
  whenChanged: string;
};

const isServiceAccount = (user: TLdapUser): boolean => {
  const spn = user.servicePrincipalName;
  if (spn && (typeof spn === "string" ? spn.length > 0 : spn.length > 0)) {
    return true;
  }
  const name = user.sAMAccountName || "";
  if (SERVICE_ACCOUNT_PATTERNS.some((pattern) => pattern.test(name))) {
    return true;
  }
  return false;
};

const toSlugName = (name: string): string =>
  name
    .toLowerCase()
    .replace(new RE2(/[^a-z0-9-]/g), "-")
    .replace(new RE2(/-+/g), "-")
    .replace(new RE2(/^-|-$/g), "");

// Parses .NET JSON date format `/Date(ms)/` to ISO 8601 string
const parseDotNetDate = (value: string | null): string | undefined => {
  if (!value) return undefined;
  const match = new RE2(/^\/Date\((\d+)\)\/$/).exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1])).toISOString();
};

// Converts a Windows FILETIME string (100-ns intervals since 1601-01-01) to ISO 8601 string
const fileTimeToIso = (filetime: string | undefined): string | undefined => {
  if (!filetime) return undefined;
  try {
    const value = BigInt(filetime);
    if (value === 0n) return undefined;
    const epochDiffMs = 11644473600000n;
    const ms = value / 10000n - epochDiffMs;
    return new Date(Number(ms)).toISOString();
  } catch {
    return undefined;
  }
};

const buildDomainDN = (domainFQDN: string): string => {
  return domainFQDN
    .split(".")
    .map((part) => `DC=${part}`)
    .join(",");
};

const parseObjectGUID = (buf: Buffer | undefined): string => {
  if (buf && buf.length === 16) {
    const hex = buf.toString("hex");
    return [
      hex.substring(6, 8) + hex.substring(4, 6) + hex.substring(2, 4) + hex.substring(0, 2),
      hex.substring(10, 12) + hex.substring(8, 10),
      hex.substring(14, 16) + hex.substring(12, 14),
      hex.substring(16, 20),
      hex.substring(20, 32)
    ].join("-");
  }
  return "";
};

const ldapSearch = async (
  client: ldapjs.Client,
  baseDN: string,
  filter: string,
  attributes: string[]
): Promise<ldapjs.SearchEntry[]> => {
  return new Promise((resolve, reject) => {
    const results: ldapjs.SearchEntry[] = [];

    client.search(
      baseDN,
      {
        filter,
        scope: "sub",
        attributes,
        paged: { pageSize: LDAP_PAGE_SIZE },
        timeLimit: LDAP_TIMEOUT / 1000
      },
      (err, searchRes) => {
        if (err) {
          reject(err);
          return;
        }

        searchRes.on("searchEntry", (entry) => {
          results.push(entry);
        });

        searchRes.on("error", (searchErr) => {
          reject(searchErr);
        });

        searchRes.on("end", (result) => {
          if (result?.status !== 0) {
            reject(new Error(`LDAP search failed with status ${result?.status}`));
          } else {
            resolve(results);
          }
        });
      }
    );
  });
};

const executeWithGateway = async <T>(
  config: {
    dcAddress: string;
    port: number;
    gatewayId: string;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (proxyPort: number) => Promise<T>
): Promise<T> => {
  const { dcAddress, port, gatewayId } = config;
  const [targetHost] = await verifyHostInputValidity({
    host: dcAddress,
    isGateway: true,
    isDynamicSecret: false
  });

  const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost,
    targetPort: port
  });

  if (!platformConnectionDetails) {
    throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
  }

  return withGatewayV2Proxy(
    async (proxyPort) => {
      return operation(proxyPort);
    },
    {
      protocol: GatewayProxyProtocol.Tcp,
      relayHost: platformConnectionDetails.relayHost,
      gateway: platformConnectionDetails.gateway,
      relay: platformConnectionDetails.relay
    }
  );
};

// Resolve AD hostnames to IP addresses by querying DNS over TCP through the DC
const resolveHostnamesViaDc = async (
  computers: TLdapComputer[],
  configuration: TAdDiscoveryConfiguration,
  gatewayId: string,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<void> => {
  await executeWithGateway(
    { dcAddress: configuration.dcAddress, port: 53, gatewayId },
    gatewayV2Service,
    async (proxyPort) => {
      // Resolve each hostname sequentially to avoid overwhelming the proxy
      // eslint-disable-next-line no-await-in-loop
      for (const computer of computers) {
        const hostname = computer.dNSHostName || computer.cn;
        if (!hostname) {
          // skip computers without a hostname
        } else if (net.isIP(hostname)) {
          computer.resolvedIp = hostname;
        } else {
          try {
            // eslint-disable-next-line no-await-in-loop
            const ip = await resolveDnsTcp(hostname, proxyPort);
            if (ip) {
              computer.resolvedIp = ip;
            } else {
              logger.warn(`DNS resolution returned no A records [hostname=${hostname}]`);
            }
          } catch (err) {
            logger.warn(err, `Failed to resolve hostname via DC DNS [hostname=${hostname}]`);
          }
        }
      }
    }
  );
};

type TLdapAttribute = { type: string; values: string[]; buffers: Buffer[] };

const getAttr = (entry: ldapjs.SearchEntry, attrName: string): string => {
  const attr = (entry as unknown as { attributes: TLdapAttribute[] }).attributes?.find(
    (a) => a.type.toLowerCase() === attrName.toLowerCase()
  );
  return attr?.values?.[0] ?? "";
};

const getAttrBuffer = (entry: ldapjs.SearchEntry, attrName: string): Buffer | undefined => {
  const attr = (entry as unknown as { attributes: TLdapAttribute[] }).attributes?.find(
    (a) => a.type.toLowerCase() === attrName.toLowerCase()
  );
  return attr?.buffers?.[0];
};

const getAttrAll = (entry: ldapjs.SearchEntry, attrName: string): string[] => {
  const attr = (entry as unknown as { attributes: TLdapAttribute[] }).attributes?.find(
    (a) => a.type.toLowerCase() === attrName.toLowerCase()
  );
  return attr?.values ?? [];
};

const executeLdapEnumeration = async (
  configuration: TAdDiscoveryConfiguration,
  credentials: TAdDiscoveryCredentials,
  gatewayId: string,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<{ computers: TLdapComputer[]; users: TLdapUser[] }> => {
  const ldapProtocol = configuration.useLdaps ? "ldaps" : "ldap";

  return executeWithGateway(
    { dcAddress: configuration.dcAddress, port: configuration.ldapPort, gatewayId },
    gatewayV2Service,
    async (proxyPort) => {
      const client = ldapjs.createClient({
        url: `${ldapProtocol}://localhost:${proxyPort}`,
        connectTimeout: LDAP_TIMEOUT,
        timeout: LDAP_TIMEOUT,
        ...(configuration.useLdaps && {
          tlsOptions: {
            rejectUnauthorized: configuration.ldapRejectUnauthorized,
            ...(configuration.ldapCaCert && {
              ca: [configuration.ldapCaCert],
              servername: configuration.ldapTlsServerName || configuration.dcAddress
            })
          }
        })
      });

      // Capture TLS/connection errors that fire before or during bind
      // Without this handler, unhandled 'error' events (e.g. TLS cert mismatch) crash the Node.js process
      let clientError: Error | null = null;
      client.on("error", (err: Error) => {
        clientError = err;
      });

      try {
        const bindDn = `${credentials.username}@${configuration.domainFQDN}`;
        await new Promise<void>((resolve, reject) => {
          client.bind(bindDn, credentials.password, (err) => {
            if (clientError) reject(clientError);
            else if (err) reject(new Error(`LDAP bind failed: ${err.message}`));
            else resolve();
          });
        });

        const baseDN = buildDomainDN(configuration.domainFQDN);

        const computerEntries = await ldapSearch(
          client,
          baseDN,
          "(&(objectClass=computer)(operatingSystem=*Server*))",
          ["cn", "dNSHostName", "operatingSystem", "operatingSystemVersion", "objectGUID", "whenChanged"]
        );

        const computers: TLdapComputer[] = computerEntries.map((entry) => ({
          cn: getAttr(entry, "cn"),
          dNSHostName: getAttr(entry, "dNSHostName"),
          operatingSystem: getAttr(entry, "operatingSystem"),
          operatingSystemVersion: getAttr(entry, "operatingSystemVersion"),
          objectGUID: parseObjectGUID(getAttrBuffer(entry, "objectGUID")),
          whenChanged: getAttr(entry, "whenChanged")
        }));

        const userEntries = await ldapSearch(client, baseDN, "(&(objectClass=user)(objectCategory=person))", [
          "sAMAccountName",
          "userPrincipalName",
          "objectGUID",
          "displayName",
          "servicePrincipalName",
          "memberOf",
          "pwdLastSet",
          "userAccountControl",
          "lastLogonTimestamp",
          "whenChanged"
        ]);

        const users: TLdapUser[] = userEntries.map((entry) => ({
          sAMAccountName: getAttr(entry, "sAMAccountName"),
          userPrincipalName: getAttr(entry, "userPrincipalName"),
          objectGUID: parseObjectGUID(getAttrBuffer(entry, "objectGUID")),
          displayName: getAttr(entry, "displayName"),
          servicePrincipalName: getAttrAll(entry, "servicePrincipalName"),
          memberOf: getAttrAll(entry, "memberOf"),
          pwdLastSet: getAttr(entry, "pwdLastSet"),
          userAccountControl: getAttr(entry, "userAccountControl"),
          lastLogonTimestamp: getAttr(entry, "lastLogonTimestamp"),
          whenChanged: getAttr(entry, "whenChanged")
        }));

        logger.info(
          `PAM AD discovery LDAP enumeration completed [computerCount=${computers.length}] [userCount=${users.length}]`
        );

        return { computers, users };
      } finally {
        try {
          client.unbind();
        } catch {
          // client may already be destroyed from a TLS/connection error
        }
      }
    }
  );
};

const upsertAdServerResource = async (
  projectId: string,
  configuration: TAdDiscoveryConfiguration,
  gatewayId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  pamResourceDAL: Pick<TPamResourceDALFactory, "create" | "find">,
  tx: Knex
) => {
  const fingerprint = configuration.domainFQDN.toLowerCase();

  const existing = await pamResourceDAL.find(
    {
      projectId,
      resourceType: PamResource.ActiveDirectory,
      discoveryFingerprint: fingerprint
    },
    { tx }
  );

  if (existing.length > 0) {
    return { resource: existing[0], isNew: false };
  }

  const domainResourceName = toSlugName(configuration.domainFQDN);

  const encryptedConnectionDetails = await encryptResourceConnectionDetails({
    projectId,
    connectionDetails: {
      domain: configuration.domainFQDN,
      dcAddress: configuration.dcAddress,
      port: configuration.ldapPort,
      useLdaps: configuration.useLdaps,
      ldapRejectUnauthorized: configuration.ldapRejectUnauthorized,
      ldapCaCert: configuration.ldapCaCert,
      ldapTlsServerName: configuration.ldapTlsServerName
    } as TActiveDirectoryResourceConnectionDetails,
    kmsService
  });

  const resource = await pamResourceDAL.create(
    {
      projectId,
      name: domainResourceName,
      resourceType: PamResource.ActiveDirectory,
      gatewayId,
      encryptedConnectionDetails,
      discoveryFingerprint: fingerprint
    },
    tx
  );

  return { resource, isNew: true };
};

const upsertWindowsServerResource = async (
  projectId: string,
  computer: TLdapComputer,
  adServerResourceId: string,
  gatewayId: string,
  winrmConfig: {
    winrmPort: number;
    useWinrmHttps: boolean;
    winrmRejectUnauthorized: boolean;
    winrmCaCert?: string;
  },
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  pamResourceDAL: Pick<TPamResourceDALFactory, "create" | "find">,
  tx: Knex
) => {
  const fingerprint = computer.objectGUID;

  const existing = await pamResourceDAL.find(
    {
      projectId,
      resourceType: PamResource.Windows,
      discoveryFingerprint: fingerprint,
      adServerResourceId
    },
    { tx }
  );

  if (existing.length > 0) {
    return { resource: existing[0], isNew: false };
  }

  const hostname = computer.dNSHostName || computer.cn;
  const resourceName = toSlugName(hostname);

  const [encryptedConnectionDetails, encryptedResourceMetadata] = await Promise.all([
    encryptResourceConnectionDetails({
      projectId,
      connectionDetails: {
        protocol: WindowsProtocol.RDP,
        hostname: computer.resolvedIp || hostname,
        port: 3389,
        ...winrmConfig
      } as TWindowsResourceConnectionDetails,
      kmsService
    }),
    encryptResourceInternalMetadata({
      projectId,
      internalMetadata: {
        osVersion: computer.operatingSystem || undefined,
        osVersionDetail: computer.operatingSystemVersion || undefined
      } as TWindowsResourceInternalMetadata,
      kmsService
    })
  ]);

  const resource = await pamResourceDAL.create(
    {
      projectId,
      name: resourceName,
      resourceType: PamResource.Windows,
      gatewayId,
      encryptedConnectionDetails,
      encryptedResourceMetadata,
      adServerResourceId,
      discoveryFingerprint: fingerprint
    },
    tx
  );

  return { resource, isNew: true };
};

const upsertDomainAccount = async (
  projectId: string,
  user: TLdapUser,
  adServerResourceId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  pamAccountDAL: Pick<TPamAccountDALFactory, "create" | "find">,
  tx: Knex
) => {
  const fingerprint = user.objectGUID;

  const existing = await pamAccountDAL.find(
    {
      resourceId: adServerResourceId,
      discoveryFingerprint: fingerprint
    },
    { tx }
  );

  if (existing.length > 0) {
    return { account: existing[0], isNew: false };
  }

  const accountName = toSlugName(user.sAMAccountName);
  const accountType = isServiceAccount(user) ? "service" : "user";

  const encryptedCredentials = await encryptAccountCredentials({
    projectId,
    credentials: {
      username: user.sAMAccountName,
      password: ""
    } as TActiveDirectoryAccountCredentials,
    kmsService
  });

  let servicePrincipalName: string[] | undefined;
  if (Array.isArray(user.servicePrincipalName)) {
    servicePrincipalName = user.servicePrincipalName;
  } else if (user.servicePrincipalName) {
    servicePrincipalName = [user.servicePrincipalName];
  }

  const internalMetadata = {
    accountType,
    adGuid: user.objectGUID,
    displayName: user.displayName || undefined,
    userPrincipalName: user.userPrincipalName || undefined,
    servicePrincipalName,
    userAccountControl: user.userAccountControl ? parseInt(user.userAccountControl, 10) : undefined,
    passwordLastSet: fileTimeToIso(user.pwdLastSet),
    lastLogon: fileTimeToIso(user.lastLogonTimestamp)
  } as TActiveDirectoryAccountInternalMetadata;

  const account = await pamAccountDAL.create(
    {
      projectId,
      resourceId: adServerResourceId,
      name: accountName,
      encryptedCredentials,
      internalMetadata,
      discoveryFingerprint: fingerprint
    },
    tx
  );

  return { account, isNew: true };
};

const executeWinRmLocalAccountEnumeration = async (
  computer: TLdapComputer,
  domainFQDN: string,
  credentials: TAdDiscoveryCredentials,
  winrmPort: number,
  useWinrmHttps: boolean,
  winrmRejectUnauthorized: boolean,
  winrmCaCert: string | undefined,
  gatewayId: string,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<TWinRmLocalUser[]> => {
  const hostname = computer.dNSHostName || computer.cn;
  const targetAddress = computer.resolvedIp || hostname;

  return executeWithGateway(
    { dcAddress: targetAddress, port: winrmPort, gatewayId },
    gatewayV2Service,
    async (proxyPort) => {
      const netbiosDomain = domainFQDN.split(".")[0].toUpperCase();
      const winrmUsername = `${netbiosDomain}\\${credentials.username}`;
      const script = `Get-LocalUser | Select-Object Name, Enabled, LastLogon, PasswordLastSet, Description, SID | ConvertTo-Json`;
      // Use machine's DNS hostname as TLS servername for cert verification
      const stdout = await runPowershell(
        script,
        "localhost",
        winrmUsername,
        credentials.password,
        proxyPort,
        useWinrmHttps,
        winrmRejectUnauthorized,
        winrmCaCert,
        hostname
      );

      if (!stdout.trim()) {
        return [];
      }

      const parsed = JSON.parse(stdout) as TWinRmLocalUser | TWinRmLocalUser[];
      return Array.isArray(parsed) ? parsed : [parsed];
    }
  );
};

const executeWinRmDependencyEnumeration = async (
  computer: TLdapComputer,
  domainFQDN: string,
  credentials: TAdDiscoveryCredentials,
  winrmPort: number,
  useWinrmHttps: boolean,
  winrmRejectUnauthorized: boolean,
  winrmCaCert: string | undefined,
  gatewayId: string,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<TWinRmDependencies> => {
  const hostname = computer.dNSHostName || computer.cn;
  const targetAddress = computer.resolvedIp || hostname;

  return executeWithGateway(
    { dcAddress: targetAddress, port: winrmPort, gatewayId },
    gatewayV2Service,
    async (proxyPort) => {
      const netbiosDomain = domainFQDN.split(".")[0].toUpperCase();
      const winrmUsername = `${netbiosDomain}\\${credentials.username}`;
      // Use machine's DNS hostname as TLS servername for cert verification
      const stdout = await runPowershell(
        DEPENDENCY_ENUMERATION_SCRIPT,
        "localhost",
        winrmUsername,
        credentials.password,
        proxyPort,
        useWinrmHttps,
        winrmRejectUnauthorized,
        winrmCaCert,
        hostname
      );

      if (!stdout.trim()) {
        return { services: [], scheduledTasks: [], iisAppPools: [] };
      }

      const parsed = JSON.parse(stdout) as Partial<TWinRmDependencies>;
      const result = {
        services: Array.isArray(parsed.services) ? parsed.services : [],
        scheduledTasks: Array.isArray(parsed.scheduledTasks) ? parsed.scheduledTasks : [],
        iisAppPools: Array.isArray(parsed.iisAppPools) ? parsed.iisAppPools : []
      };

      return result;
    }
  );
};

// Resolve a dependency's "run as" username to a discovered account ID
// Handles formats: DOMAIN\user, user@domain.com, .\localuser, plain localuser
const resolveAccountForDependency = (
  runAsUser: string,
  domainFQDN: string,
  domainAccountMap: Map<string, string>,
  localAccountMap: Map<string, string>
): string | null => {
  if (!runAsUser) return null;

  const normalized = runAsUser.trim();
  const netbiosDomain = domainFQDN.split(".")[0].toUpperCase();

  // DOMAIN\user format
  if (normalized.includes("\\")) {
    const [domain, user] = normalized.split("\\", 2);
    if (domain === ".") {
      // .\user is explicitly local
      return localAccountMap.get(user.toLowerCase()) ?? null;
    }
    if (domain.toUpperCase() === netbiosDomain) {
      // NETBIOS\user — domain takes priority
      return domainAccountMap.get(user.toLowerCase()) ?? localAccountMap.get(user.toLowerCase()) ?? null;
    }
    // Domain account
    return domainAccountMap.get(user.toLowerCase()) ?? null;
  }

  // user@domain format
  if (normalized.includes("@")) {
    const [user] = normalized.split("@", 2);
    return domainAccountMap.get(user.toLowerCase()) ?? null;
  }

  // Plain username — check local first, then domain
  return localAccountMap.get(normalized.toLowerCase()) ?? domainAccountMap.get(normalized.toLowerCase()) ?? null;
};

const upsertLocalAccount = async (
  projectId: string,
  localUser: TWinRmLocalUser,
  computerObjectGUID: string,
  windowsServerResourceId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  pamAccountDAL: Pick<TPamAccountDALFactory, "create" | "find">,
  tx: Knex
) => {
  const fingerprint = `${computerObjectGUID}:${localUser.Name.toLowerCase()}`;

  const existing = await pamAccountDAL.find(
    {
      resourceId: windowsServerResourceId,
      discoveryFingerprint: fingerprint
    },
    { tx }
  );

  if (existing.length > 0) {
    return { account: existing[0], isNew: false };
  }

  const accountName = toSlugName(localUser.Name);

  const encryptedCredentials = await encryptAccountCredentials({
    projectId,
    credentials: {
      username: localUser.Name,
      password: ""
    } as TWindowsAccountCredentials,
    kmsService
  });

  const internalMetadata = {
    accountType: WindowsAccountType.User,
    lastLogon: parseDotNetDate(localUser.LastLogon),
    passwordLastSet: parseDotNetDate(localUser.PasswordLastSet),
    sid: localUser.SID?.Value || undefined,
    enabled: localUser.Enabled
  } as TWindowsAccountMetadata;

  const account = await pamAccountDAL.create(
    {
      projectId,
      resourceId: windowsServerResourceId,
      name: accountName,
      encryptedCredentials,
      internalMetadata,
      discoveryFingerprint: fingerprint
    },
    tx
  );

  return { account, isNew: true };
};

const upsertDiscoveredDependency = async (
  dependencyType: PamAccountDependencyType,
  name: string,
  displayName: string | null,
  state: string | null,
  data: Record<string, unknown>,
  accountId: string,
  resourceId: string,
  discoverySourceId: string,
  runId: string,
  pamAccountDependenciesDAL: Pick<TPamAccountDependenciesDALFactory, "upsertDependency">,
  pamDiscoverySourceDependenciesDAL: Pick<TPamDiscoverySourceDependenciesDALFactory, "upsertJunction">
) => {
  const dependency = await pamAccountDependenciesDAL.upsertDependency({
    accountId,
    resourceId,
    dependencyType,
    name,
    displayName,
    state,
    data,
    source: PamAccountDependencySource.Discovery
  });

  await pamDiscoverySourceDependenciesDAL.upsertJunction({
    discoverySourceId,
    dependencyId: dependency.id,
    lastSeenRunId: runId
  });

  return dependency;
};

export const activeDirectoryDiscoveryFactory: TPamDiscoveryFactory<
  TAdDiscoveryConfiguration,
  TAdDiscoveryCredentials
> = (_discoveryType, configuration, credentials, gatewayId, projectId, gatewayV2Service) => {
  const validateConnection = async () => {
    try {
      const ldapProtocol = configuration.useLdaps ? "ldaps" : "ldap";
      await executeWithGateway(
        { dcAddress: configuration.dcAddress, port: configuration.ldapPort, gatewayId },
        gatewayV2Service,
        async (proxyPort) => {
          return new Promise<void>((resolve, reject) => {
            const client = ldapjs.createClient({
              url: `${ldapProtocol}://localhost:${proxyPort}`,
              connectTimeout: LDAP_TIMEOUT,
              timeout: LDAP_TIMEOUT,
              ...(configuration.useLdaps && {
                tlsOptions: {
                  rejectUnauthorized: configuration.ldapRejectUnauthorized,
                  ...(configuration.ldapCaCert && {
                    ca: [configuration.ldapCaCert],
                    servername: configuration.ldapTlsServerName || configuration.dcAddress
                  })
                }
              })
            });

            client.on("error", (err: Error) => {
              client.unbind();
              reject(err);
            });

            const bindDn = `${credentials.username}@${configuration.domainFQDN}`;
            client.bind(bindDn, credentials.password, (err) => {
              if (err) {
                client.unbind();
                logger.warn(err, "PAM AD discovery LDAP bind failed during connection validation");
                reject(new Error(`LDAP bind failed: ${err.message}`));
              } else {
                client.unbind();
                resolve();
              }
            });
          });
        }
      );
    } catch (error) {
      throw new BadRequestError({
        message: `Unable to validate connection to Active Directory: ${(error as Error).message || String(error)}`
      });
    }
  };

  const scan = async (
    discoverySourceId: string,
    triggeredBy: PamDiscoverySourceRunTrigger,
    deps: TPamDiscoveryScanDeps
  ) => {
    const {
      pamDiscoverySourceDAL,
      pamDiscoveryRunDAL,
      pamDiscoverySourceResourcesDAL,
      pamDiscoverySourceAccountsDAL,
      pamDiscoverySourceDependenciesDAL,
      pamAccountDependenciesDAL,
      pamResourceDAL,
      pamAccountDAL,
      kmsService
    } = deps;

    // Create discovery run
    const run = await pamDiscoveryRunDAL.create({
      discoverySourceId,
      status: PamDiscoverySourceRunStatus.Running,
      triggeredBy,
      startedAt: new Date(),
      progress: {
        adEnumeration: { status: PamDiscoveryStepStatus.Running }
      } as TActiveDirectoryDiscoverySourceRunProgress
    });

    let adEnumerationSucceeded = false;
    let resourcesDiscoveredCount = 0;
    let accountsDiscoveredCount = 0;
    let dependenciesDiscoveredCount = 0;
    let newResourcesCount = 0;
    let newAccountsCount = 0;
    let newDependenciesCount = 0;

    try {
      const { computers, users } = await executeLdapEnumeration(
        configuration,
        credentials,
        gatewayId,
        gatewayV2Service
      );

      adEnumerationSucceeded = true;

      // Resolve computer hostnames to IPs via DC DNS so the gateway can reach them
      try {
        await resolveHostnamesViaDc(computers, configuration, gatewayId, gatewayV2Service);
      } catch (err) {
        logger.warn(err, "Failed to resolve hostnames via DC DNS, will use hostnames directly");
      }

      await pamDiscoveryRunDAL.updateById(run.id, {
        progress: {
          adEnumeration: { status: PamDiscoveryStepStatus.Completed, completedAt: new Date().toISOString() },
          machineEnumeration: {
            status: PamDiscoveryStepStatus.Running,
            totalMachines: computers.length,
            scannedMachines: 0,
            failedMachines: 0
          }
        } as TActiveDirectoryDiscoverySourceRunProgress
      });

      // Auto-import AD Server resource
      const { resource: adServerResource, isNew: isAdServerNew } = await pamResourceDAL.transaction(async (tx) => {
        const result = await upsertAdServerResource(
          projectId,
          configuration,
          gatewayId,
          kmsService,
          pamResourceDAL,
          tx
        );

        await pamDiscoverySourceResourcesDAL.upsertJunction(
          {
            discoverySourceId,
            resourceId: result.resource.id,
            lastDiscoveredRunId: run.id
          },
          tx
        );

        return result;
      });
      resourcesDiscoveredCount += 1;
      if (isAdServerNew) newResourcesCount += 1;

      // Auto-import Windows Server resources and build mapping for local account discovery
      const computerResourceMap = new Map<string, string>(); // objectGUID -> resourceId

      for await (const computer of computers) {
        try {
          const { resource: windowsResource, isNew } = await pamResourceDAL.transaction(async (tx) => {
            const result = await upsertWindowsServerResource(
              projectId,
              computer,
              adServerResource.id,
              gatewayId,
              {
                winrmPort: configuration.winrmPort,
                useWinrmHttps: configuration.useWinrmHttps,
                winrmRejectUnauthorized: configuration.winrmRejectUnauthorized,
                winrmCaCert: configuration.winrmCaCert
              },
              kmsService,
              pamResourceDAL,
              tx
            );

            await pamDiscoverySourceResourcesDAL.upsertJunction(
              {
                discoverySourceId,
                resourceId: result.resource.id,
                lastDiscoveredRunId: run.id
              },
              tx
            );

            return result;
          });

          computerResourceMap.set(computer.objectGUID, windowsResource.id);
          resourcesDiscoveredCount += 1;
          if (isNew) newResourcesCount += 1;
        } catch (err) {
          logger.warn(err, `Failed to import Windows Server resource [computer=${computer.dNSHostName}]`);
        }
      }

      // Persist resource counts before processing accounts
      await pamDiscoveryRunDAL.updateById(run.id, {
        resourcesDiscoveredCount
      });

      // Auto-import domain accounts and build lookup map for dependency resolution
      const domainAccountMap = new Map<string, string>(); // sAMAccountName (lowercase) -> accountId

      for await (const user of users) {
        try {
          const { account, isNew } = await pamAccountDAL.transaction(async (tx) => {
            const result = await upsertDomainAccount(
              projectId,
              user,
              adServerResource.id,
              kmsService,
              pamAccountDAL,
              tx
            );

            await pamDiscoverySourceAccountsDAL.upsertJunction(
              {
                discoverySourceId,
                accountId: result.account.id,
                lastDiscoveredRunId: run.id
              },
              tx
            );

            return result;
          });

          domainAccountMap.set(user.sAMAccountName.toLowerCase(), account.id);
          accountsDiscoveredCount += 1;
          if (isNew) newAccountsCount += 1;
        } catch (err) {
          logger.warn(err, `Failed to import domain account [username=${user.sAMAccountName}]`);
        }
      }

      // WinRM local account discovery
      let scannedMachines = 0;
      let failedMachines = 0;
      const machineErrors: Record<string, string> = {};

      // eslint-disable-next-line no-await-in-loop
      for (const computer of computers) {
        const windowsResourceId = computerResourceMap.get(computer.objectGUID);
        if (!windowsResourceId) {
          failedMachines += 1;
        } else {
          const hostname = computer.dNSHostName || computer.cn;

          try {
            // eslint-disable-next-line no-await-in-loop
            const localUsers = await executeWinRmLocalAccountEnumeration(
              computer,
              configuration.domainFQDN,
              credentials,
              configuration.winrmPort,
              configuration.useWinrmHttps,
              configuration.winrmRejectUnauthorized,
              configuration.winrmCaCert,
              gatewayId,
              gatewayV2Service
            );

            const localAccountMap = new Map<string, string>(); // Name (lowercase) -> accountId

            for (const localUser of localUsers) {
              try {
                // eslint-disable-next-line no-await-in-loop
                const { account, isNew } = await pamAccountDAL.transaction(async (tx) => {
                  const result = await upsertLocalAccount(
                    projectId,
                    localUser,
                    computer.objectGUID,
                    windowsResourceId,
                    kmsService,
                    pamAccountDAL,
                    tx
                  );

                  await pamDiscoverySourceAccountsDAL.upsertJunction(
                    {
                      discoverySourceId,
                      accountId: result.account.id,
                      lastDiscoveredRunId: run.id
                    },
                    tx
                  );

                  return result;
                });

                localAccountMap.set(localUser.Name.toLowerCase(), account.id);
                accountsDiscoveredCount += 1;
                if (isNew) newAccountsCount += 1;
              } catch (err) {
                logger.warn(err, `Failed to import local account [username=${localUser.Name}] [computer=${hostname}]`);
              }
            }

            // Dependency discovery (services, scheduled tasks, IIS app pools)
            if (configuration.discoverDependencies)
              try {
                // eslint-disable-next-line no-await-in-loop
                const dependencies = await executeWinRmDependencyEnumeration(
                  computer,
                  configuration.domainFQDN,
                  credentials,
                  configuration.winrmPort,
                  configuration.useWinrmHttps,
                  configuration.winrmRejectUnauthorized,
                  configuration.winrmCaCert,
                  gatewayId,
                  gatewayV2Service
                );

                const depItems: {
                  type: PamAccountDependencyType;
                  name: string;
                  displayName: string | null;
                  state: string | null;
                  runAsUser: string;
                  data: Record<string, unknown>;
                }[] = [];

                for (const svc of dependencies.services) {
                  const startName = (svc.StartName || "").toLowerCase();
                  if (!startName || BUILTIN_SERVICE_ACCOUNTS.has(startName) || startName.startsWith("nt service\\")) {
                    // eslint-disable-next-line no-continue
                    continue;
                  }
                  depItems.push({
                    type: PamAccountDependencyType.WindowsService,
                    name: svc.Name,
                    displayName: svc.DisplayName,
                    state: svc.State,
                    runAsUser: svc.StartName,
                    data: {
                      startMode: svc.StartMode,
                      processId: svc.ProcessId,
                      pathName: svc.PathName,
                      description: svc.Description,
                      runAsAccount: svc.StartName
                    }
                  });
                }

                for (const task of dependencies.scheduledTasks) {
                  depItems.push({
                    type: PamAccountDependencyType.ScheduledTask,
                    name: task.TaskName,
                    displayName: null,
                    state: task.State,
                    runAsUser: task.UserId,
                    data: {
                      taskPath: task.TaskPath,
                      logonType: task.LogonType,
                      runLevel: task.RunLevel,
                      lastRunTime: task.LastRunTime,
                      nextRunTime: task.NextRunTime,
                      lastTaskResult: task.LastTaskResult,
                      runAsAccount: task.UserId,
                      triggers: task.Triggers ?? [],
                      actions: task.Actions ?? []
                    }
                  });
                }

                for (const pool of dependencies.iisAppPools) {
                  depItems.push({
                    type: PamAccountDependencyType.IisAppPool,
                    name: pool.Name,
                    displayName: null,
                    state: pool.State,
                    runAsUser: pool.Username,
                    data: {
                      identityType: pool.IdentityType,
                      managedRuntimeVersion: pool.ManagedRuntimeVersion,
                      managedPipelineMode: pool.ManagedPipelineMode,
                      autoStart: pool.AutoStart,
                      runAsAccount: pool.Username
                    }
                  });
                }

                for (const dep of depItems) {
                  const accountId = resolveAccountForDependency(
                    dep.runAsUser,
                    configuration.domainFQDN,
                    domainAccountMap,
                    localAccountMap
                  );

                  if (accountId) {
                    try {
                      // eslint-disable-next-line no-await-in-loop
                      const dependency = await upsertDiscoveredDependency(
                        dep.type,
                        dep.name,
                        dep.displayName,
                        dep.state,
                        dep.data,
                        accountId,
                        windowsResourceId,
                        discoverySourceId,
                        run.id,
                        pamAccountDependenciesDAL,
                        pamDiscoverySourceDependenciesDAL
                      );

                      dependenciesDiscoveredCount += 1;

                      if (dependency.isNew) {
                        newDependenciesCount += 1;
                      }
                    } catch (err) {
                      logger.warn(err, `Failed to import dependency [dependency=${dep.name}] [computer=${hostname}]`);
                    }
                  }
                }
              } catch (err) {
                logger.warn(err, `WinRM dependency enumeration failed for machine [computer=${hostname}]`);
              }

            scannedMachines += 1;
          } catch (err) {
            failedMachines += 1;
            machineErrors[hostname] = (err as Error).message;
            logger.warn(err, `WinRM local account enumeration failed for machine [computer=${hostname}]`);
          }
        }

        // Update progress periodically
        // eslint-disable-next-line no-await-in-loop
        await pamDiscoveryRunDAL.updateById(run.id, {
          accountsDiscoveredCount,
          dependenciesDiscoveredCount,
          progress: {
            adEnumeration: { status: PamDiscoveryStepStatus.Completed, completedAt: new Date().toISOString() },
            machineEnumeration: {
              status: PamDiscoveryStepStatus.Running,
              totalMachines: computers.length,
              scannedMachines,
              failedMachines
            },
            machineErrors: Object.keys(machineErrors).length > 0 ? machineErrors : undefined
          } as TActiveDirectoryDiscoverySourceRunProgress
        });
      }

      if (adEnumerationSucceeded) {
        const staleResourcesCount =
          (await pamDiscoverySourceResourcesDAL.markStaleForRun(discoverySourceId, run.id)) || 0;
        const staleAccountsCount =
          (await pamDiscoverySourceAccountsDAL.markStaleForRun(discoverySourceId, run.id)) || 0;
        const staleDependenciesCount =
          (await pamDiscoverySourceDependenciesDAL.markStaleForRun(discoverySourceId, run.id)) || 0;

        const machineEnumerationStatus =
          failedMachines === computers.length && computers.length > 0
            ? PamDiscoveryStepStatus.Failed
            : PamDiscoveryStepStatus.Completed;

        await pamDiscoveryRunDAL.updateById(run.id, {
          status: PamDiscoverySourceRunStatus.Completed,
          resourcesDiscoveredCount,
          accountsDiscoveredCount,
          dependenciesDiscoveredCount,
          newResourcesCount,
          staleResourcesCount,
          newAccountsCount,
          staleAccountsCount,
          newDependenciesCount,
          staleDependenciesCount,
          completedAt: new Date(),
          progress: {
            adEnumeration: { status: PamDiscoveryStepStatus.Completed, completedAt: new Date().toISOString() },
            machineEnumeration: {
              status: machineEnumerationStatus,
              totalMachines: computers.length,
              scannedMachines,
              failedMachines,
              statusMessage:
                failedMachines > 0
                  ? `${failedMachines} of ${computers.length} machines failed local account enumeration`
                  : undefined
            },
            machineErrors: Object.keys(machineErrors).length > 0 ? machineErrors : undefined
          } as TActiveDirectoryDiscoverySourceRunProgress
        });
      }
    } catch (error) {
      logger.error(error, `PAM AD discovery scan failed [discoverySourceId=${discoverySourceId}] [runId=${run.id}]`);

      const progress: TActiveDirectoryDiscoverySourceRunProgress = adEnumerationSucceeded
        ? {
            adEnumeration: { status: PamDiscoveryStepStatus.Completed },
            machineEnumeration: { status: PamDiscoveryStepStatus.Failed, statusMessage: (error as Error).message }
          }
        : {
            adEnumeration: { status: PamDiscoveryStepStatus.Failed, error: (error as Error).message }
          };

      await pamDiscoveryRunDAL.updateById(run.id, {
        status: PamDiscoverySourceRunStatus.Failed,
        progress,
        errorMessage: (error as Error).message,
        completedAt: new Date()
      });
    } finally {
      await pamDiscoverySourceDAL.updateById(discoverySourceId, {
        lastRunAt: new Date()
      });
    }
  };

  return {
    validateConnection,
    scan
  };
};
