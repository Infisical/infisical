import ldapjs from "ldapjs";

import { TPamDiscoveryScanDeps } from "@app/ee/services/pam-discovery/pam-discovery-factory";
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
  TActiveDirectoryAccountMetadata,
  TActiveDirectoryResourceConnectionDetails
} from "../../pam-resource/active-directory/active-directory-resource-types";
import { TPamResourceDALFactory } from "../../pam-resource/pam-resource-dal";
import { PamResource } from "../../pam-resource/pam-resource-enums";
import { encryptResourceConnectionDetails } from "../../pam-resource/pam-resource-fns";
import { WindowsProtocol } from "../../pam-resource/windows-server/windows-server-resource-enums";
import { TWindowsResourceConnectionDetails } from "../../pam-resource/windows-server/windows-server-resource-types";
import { PamDiscoveryRunStatus, PamDiscoveryRunTrigger } from "../pam-discovery-enums";
import { TPamDiscoveryFactory } from "../pam-discovery-types";
import {
  TActiveDirectoryDiscoveryConfiguration as TAdDiscoveryConfiguration,
  TActiveDirectoryDiscoveryCredentials as TAdDiscoveryCredentials,
  TActiveDirectoryDiscoverySourceRunProgress
} from "./active-directory-discovery-types";

const LDAP_TIMEOUT = 30 * 1000;
const LDAP_PAGE_SIZE = 500;
const SERVICE_ACCOUNT_PATTERNS = [/^svc[_-]/i, /[_-]service$/i, /[_-]svc$/i];

type TLdapComputer = {
  cn: string;
  dNSHostName: string;
  operatingSystem: string;
  objectGUID: string;
  whenChanged: string;
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
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

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
  return executeWithGateway(
    { dcAddress: configuration.dcAddress, port: configuration.port, gatewayId },
    gatewayV2Service,
    async (proxyPort) => {
      const client = ldapjs.createClient({
        url: `ldap://localhost:${proxyPort}`,
        connectTimeout: LDAP_TIMEOUT,
        timeout: LDAP_TIMEOUT
      });

      try {
        const bindDn = `${credentials.username}@${configuration.domainFQDN}`;
        await new Promise<void>((resolve, reject) => {
          client.bind(bindDn, credentials.password, (err) => {
            if (err) reject(new Error(`LDAP bind failed: ${err.message}`));
            else resolve();
          });
        });

        const baseDN = buildDomainDN(configuration.domainFQDN);

        const computerEntries = await ldapSearch(
          client,
          baseDN,
          "(&(objectClass=computer)(operatingSystem=*Server*))",
          ["cn", "dNSHostName", "operatingSystem", "objectGUID", "whenChanged"]
        );

        const computers: TLdapComputer[] = computerEntries.map((entry) => ({
          cn: getAttr(entry, "cn"),
          dNSHostName: getAttr(entry, "dNSHostName"),
          operatingSystem: getAttr(entry, "operatingSystem"),
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
          whenChanged: getAttr(entry, "whenChanged")
        }));

        logger.info(
          { computerCount: computers.length, userCount: users.length },
          "PAM AD discovery LDAP enumeration completed"
        );

        return { computers, users };
      } finally {
        client.unbind();
      }
    }
  );
};

const upsertAdServerResource = async (
  projectId: string,
  configuration: TAdDiscoveryConfiguration,
  gatewayId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  pamResourceDAL: Pick<TPamResourceDALFactory, "create" | "find">
) => {
  const existing = await pamResourceDAL.find({
    projectId,
    resourceType: PamResource.ActiveDirectory
  });

  const domainResourceName = toSlugName(configuration.domainFQDN);
  const matched = existing.find((r) => r.name === domainResourceName);
  if (matched) return { resource: matched, isNew: false };

  const encryptedConnectionDetails = await encryptResourceConnectionDetails({
    projectId,
    connectionDetails: {
      domain: configuration.domainFQDN,
      dcAddress: configuration.dcAddress,
      port: configuration.port
    } as TActiveDirectoryResourceConnectionDetails,
    kmsService
  });

  const resource = await pamResourceDAL.create({
    projectId,
    name: domainResourceName,
    resourceType: PamResource.ActiveDirectory,
    gatewayId,
    encryptedConnectionDetails
  });

  return { resource, isNew: true };
};

const upsertWindowsServerResource = async (
  projectId: string,
  computer: TLdapComputer,
  adServerResourceId: string,
  gatewayId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  pamResourceDAL: Pick<TPamResourceDALFactory, "create" | "find">
) => {
  const hostname = computer.dNSHostName || computer.cn;
  const resourceName = toSlugName(hostname);

  const existing = await pamResourceDAL.find({
    projectId,
    resourceType: PamResource.Windows,
    name: resourceName
  });

  if (existing.length > 0) return { resource: existing[0], isNew: false };

  const encryptedConnectionDetails = await encryptResourceConnectionDetails({
    projectId,
    connectionDetails: {
      protocol: WindowsProtocol.RDP,
      hostname,
      port: 3389
    } as TWindowsResourceConnectionDetails,
    kmsService
  });

  const resource = await pamResourceDAL.create({
    projectId,
    name: resourceName,
    resourceType: PamResource.Windows,
    gatewayId,
    encryptedConnectionDetails,
    adServerResourceId
  });

  return { resource, isNew: true };
};

const upsertDomainAccount = async (
  projectId: string,
  user: TLdapUser,
  adServerResourceId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  pamAccountDAL: Pick<TPamAccountDALFactory, "create" | "find">
) => {
  const accountName = user.sAMAccountName;
  const accountType = isServiceAccount(user) ? "service" : "user";

  const existing = await pamAccountDAL.find({
    resourceId: adServerResourceId,
    name: accountName
  });

  if (existing.length > 0) return { account: existing[0], isNew: false };

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

  const metadata = {
    accountType,
    adGuid: user.objectGUID,
    displayName: user.displayName || undefined,
    userPrincipalName: user.userPrincipalName || undefined,
    servicePrincipalName,
    userAccountControl: user.userAccountControl ? parseInt(user.userAccountControl, 10) : undefined,
    pwdLastSet: user.pwdLastSet || undefined
  } as TActiveDirectoryAccountMetadata;

  const account = await pamAccountDAL.create({
    projectId,
    resourceId: adServerResourceId,
    name: accountName,
    encryptedCredentials,
    metadata
  });

  return { account, isNew: true };
};

export const activeDirectoryDiscoveryFactory: TPamDiscoveryFactory<
  TAdDiscoveryConfiguration,
  TAdDiscoveryCredentials
> = (_discoveryType, configuration, credentials, gatewayId, projectId, gatewayV2Service) => {
  const validateConnection = async () => {
    try {
      await executeWithGateway(
        { dcAddress: configuration.dcAddress, port: configuration.port, gatewayId },
        gatewayV2Service,
        async (proxyPort) => {
          return new Promise<void>((resolve, reject) => {
            const client = ldapjs.createClient({
              url: `ldap://localhost:${proxyPort}`,
              connectTimeout: LDAP_TIMEOUT,
              timeout: LDAP_TIMEOUT
            });

            client.on("error", (err: Error) => {
              client.unbind();
              reject(err);
            });

            const bindDn = `${credentials.username}@${configuration.domainFQDN}`;
            client.bind(bindDn, credentials.password, (err) => {
              if (err) {
                client.unbind();
                reject(new Error("LDAP bind failed: invalid credentials"));
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

  const scan = async (discoverySourceId: string, deps: TPamDiscoveryScanDeps) => {
    const {
      pamDiscoverySourceDAL,
      pamDiscoveryRunDAL,
      pamDiscoverySourceResourcesDAL,
      pamDiscoverySourceAccountsDAL,
      pamResourceDAL,
      pamAccountDAL,
      kmsService
    } = deps;

    // Create discovery run
    const run = await pamDiscoveryRunDAL.create({
      discoverySourceId,
      status: PamDiscoveryRunStatus.Running,
      triggeredBy: PamDiscoveryRunTrigger.Manual,
      startedAt: new Date(),
      progress: {
        adEnumeration: { status: "running" }
      } as TActiveDirectoryDiscoverySourceRunProgress
    });

    let adEnumerationSucceeded = false;
    let resourcesDiscovered = 0;
    let accountsDiscovered = 0;
    let newItems = 0;

    try {
      const { computers, users } = await executeLdapEnumeration(
        configuration,
        credentials,
        gatewayId,
        gatewayV2Service
      );

      adEnumerationSucceeded = true;

      await pamDiscoveryRunDAL.updateById(run.id, {
        progress: {
          adEnumeration: { status: "completed", completedAt: new Date().toISOString() },
          dependencyScan: { status: "skipped", reason: "WinRM scanning not yet implemented" }
        } as TActiveDirectoryDiscoverySourceRunProgress
      });

      // Auto-import AD Server resource
      const { resource: adServerResource, isNew: isAdServerNew } = await upsertAdServerResource(
        projectId,
        configuration,
        gatewayId,
        kmsService,
        pamResourceDAL
      );

      await pamDiscoverySourceResourcesDAL.upsertJunction({
        discoverySourceId,
        resourceId: adServerResource.id,
        lastDiscoveredRunId: run.id
      });
      resourcesDiscovered += 1;
      if (isAdServerNew) newItems += 1;

      // Auto-import Windows Server resources
      for await (const computer of computers) {
        try {
          const { resource, isNew } = await upsertWindowsServerResource(
            projectId,
            computer,
            adServerResource.id,
            gatewayId,
            kmsService,
            pamResourceDAL
          );

          await pamDiscoverySourceResourcesDAL.upsertJunction({
            discoverySourceId,
            resourceId: resource.id,
            lastDiscoveredRunId: run.id
          });

          resourcesDiscovered += 1;
          if (isNew) newItems += 1;
        } catch (err) {
          logger.warn({ err, computer: computer.dNSHostName }, "Failed to import Windows Server resource");
        }
      }

      // Auto-import domain accounts
      for await (const user of users) {
        try {
          const { account, isNew } = await upsertDomainAccount(
            projectId,
            user,
            adServerResource.id,
            kmsService,
            pamAccountDAL
          );

          await pamDiscoverySourceAccountsDAL.upsertJunction({
            discoverySourceId,
            accountId: account.id,
            lastDiscoveredRunId: run.id
          });

          accountsDiscovered += 1;
          if (isNew) newItems += 1;
        } catch (err) {
          logger.warn({ err, user: user.sAMAccountName }, "Failed to import domain account");
        }
      }

      if (adEnumerationSucceeded) {
        const staleResources = await pamDiscoverySourceResourcesDAL.markStaleForRun(discoverySourceId, run.id);
        const staleAccounts = await pamDiscoverySourceAccountsDAL.markStaleForRun(discoverySourceId, run.id);
        const staleSinceLastRun = (staleResources || 0) + (staleAccounts || 0);

        await pamDiscoveryRunDAL.updateById(run.id, {
          status: PamDiscoveryRunStatus.Completed,
          resourcesDiscovered,
          accountsDiscovered,
          dependenciesDiscovered: 0,
          newSinceLastRun: newItems,
          staleSinceLastRun,
          completedAt: new Date()
        });
      }

      await pamDiscoverySourceDAL.updateById(discoverySourceId, {
        lastRunAt: new Date()
      });
    } catch (error) {
      logger.error({ error, discoverySourceId, runId: run.id }, "PAM AD discovery scan failed");

      const progress: TActiveDirectoryDiscoverySourceRunProgress = adEnumerationSucceeded
        ? {
            adEnumeration: { status: "completed" },
            dependencyScan: { status: "failed", reason: (error as Error).message }
          }
        : {
            adEnumeration: { status: "failed", error: (error as Error).message }
          };

      await pamDiscoveryRunDAL.updateById(run.id, {
        status: PamDiscoveryRunStatus.Failed,
        progress,
        errorMessage: (error as Error).message,
        completedAt: new Date()
      });

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
