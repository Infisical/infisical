import net from "node:net";

import ldapjs from "@infisical/ldapjs";
import slugify from "@sindresorhus/slugify";
import RE2 from "re2";
import { runPowershell } from "winrm-client";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { PamAccountType } from "../../pam/pam-enums";
import { isDomainQualifiedUsername, toNetbiosUsername } from "../../pam-account/pam-account-schemas";
import { executeWithGateway } from "../pam-discovery-fns";
import {
  TDiscoveredAccount,
  TDiscoveryMachineError,
  TDiscoveryScanResult,
  TPamDiscoveryFactory
} from "../pam-discovery-types";
import { resolveDnsTcp } from "./dns-over-dc";

const LDAP_TIMEOUT = 30 * 1000;
const LDAP_PAGE_SIZE = 500;
const TRAILING_HYPHENS_REGEX = new RE2(/-+$/);

type TGatewayDep = Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
type TLdapAttribute = { type: string; values: string[]; buffers: Buffer[] };
type TLdapComputer = { cn: string; dNSHostName: string; objectGUID: string; resolvedIp?: string };
type TLdapUser = { sAMAccountName: string; objectGUID: string };
type TWinRmLocalUser = { Name: string };

const buildDomainDN = (domainFqdn: string) =>
  domainFqdn
    .split(".")
    .map((part) => `DC=${part}`)
    .join(",");

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

const getAttr = (entry: ldapjs.SearchEntry, name: string): string =>
  (entry as unknown as { attributes: TLdapAttribute[] }).attributes?.find(
    (a) => a.type.toLowerCase() === name.toLowerCase()
  )?.values?.[0] ?? "";

const getAttrBuffer = (entry: ldapjs.SearchEntry, name: string): Buffer | undefined =>
  (entry as unknown as { attributes: TLdapAttribute[] }).attributes?.find(
    (a) => a.type.toLowerCase() === name.toLowerCase()
  )?.buffers?.[0];

const ldapSearch = (client: ldapjs.Client, baseDN: string, filter: string, attributes: string[]) =>
  new Promise<ldapjs.SearchEntry[]>((resolve, reject) => {
    const results: ldapjs.SearchEntry[] = [];
    client.search(
      baseDN,
      { filter, scope: "sub", attributes, paged: { pageSize: LDAP_PAGE_SIZE }, timeLimit: LDAP_TIMEOUT / 1000 },
      (err, res) => {
        if (err) return reject(err);
        res.on("searchEntry", (entry) => results.push(entry));
        res.on("error", reject);
        res.on("end", (result) =>
          result?.status !== 0
            ? reject(new Error(`LDAP search failed with status ${result?.status}`))
            : resolve(results)
        );
      }
    );
  });

type TAdConnection = {
  domain: string;
  dcAddress: string;
  port: number;
  rdpPort: number;
  useLdaps: boolean;
  ldapRejectUnauthorized: boolean;
  ldapCaCert?: string;
  ldapTlsServerName?: string;
  username: string;
};

type TWinrmConfig = { port: number; useHttps: boolean; rejectUnauthorized: boolean; caCert?: string };

const runLdap = <T>(
  conn: TAdConnection,
  credentials: { username: string; password?: string },
  gatewayId: string,
  gatewayV2Service: TGatewayDep,
  operation: (client: ldapjs.Client) => Promise<T>
): Promise<T> =>
  executeWithGateway(conn.dcAddress, conn.port, gatewayId, gatewayV2Service, async (proxyPort) => {
    const client = ldapjs.createClient({
      url: `${conn.useLdaps ? "ldaps" : "ldap"}://localhost:${proxyPort}`,
      connectTimeout: LDAP_TIMEOUT,
      timeout: LDAP_TIMEOUT,
      ...(conn.useLdaps && {
        tlsOptions: {
          rejectUnauthorized: conn.ldapRejectUnauthorized,
          servername: conn.ldapTlsServerName || conn.dcAddress,
          ...(conn.ldapCaCert && { ca: [conn.ldapCaCert] })
        }
      })
    });

    // Unhandled 'error' events (e.g. TLS mismatch) would crash the process, so capture them
    let clientError: Error | null = null;
    client.on("error", (err: Error) => {
      clientError = err;
    });

    try {
      const bindDn = isDomainQualifiedUsername(conn.username) ? conn.username : `${conn.username}@${conn.domain}`;
      await new Promise<void>((resolve, reject) => {
        client.bind(bindDn, credentials.password ?? "", (err) => {
          if (clientError) reject(clientError);
          else if (err) reject(new Error(`LDAP bind failed: ${err.message}`));
          else resolve();
        });
      });
      return await operation(client);
    } finally {
      try {
        client.unbind();
      } catch {
        // client may already be destroyed
      }
    }
  });

// Resolve each server's hostname to an IP via the DC's DNS so the gateway can reach it for WinRM
const resolveHostnamesViaDc = (
  computers: TLdapComputer[],
  conn: TAdConnection,
  gatewayId: string,
  gatewayV2Service: TGatewayDep
): Promise<void> =>
  executeWithGateway(conn.dcAddress, 53, gatewayId, gatewayV2Service, async (proxyPort) => {
    for (const computer of computers) {
      const hostname = computer.dNSHostName || computer.cn;
      if (!hostname) {
        // no hostname to resolve
      } else if (net.isIP(hostname)) {
        computer.resolvedIp = hostname;
      } else {
        try {
          // eslint-disable-next-line no-await-in-loop
          const ip = await resolveDnsTcp(hostname, proxyPort);
          if (ip) computer.resolvedIp = ip;
        } catch (err) {
          logger.warn(err, `PAM AD discovery failed to resolve hostname [hostname=${hostname}]`);
        }
      }
    }
  });

const enumerateLocalUsers = (
  computer: TLdapComputer,
  conn: TAdConnection,
  password: string,
  winrm: TWinrmConfig,
  gatewayId: string,
  gatewayV2Service: TGatewayDep
): Promise<TWinRmLocalUser[]> => {
  const hostname = computer.dNSHostName || computer.cn;
  const targetAddress = computer.resolvedIp || hostname;

  return executeWithGateway(targetAddress, winrm.port, gatewayId, gatewayV2Service, async (proxyPort) => {
    const winrmUsername = toNetbiosUsername(conn.username, conn.domain);
    const script =
      "Get-LocalUser | Select-Object Name, Enabled, LastLogon, PasswordLastSet, Description, SID | ConvertTo-Json";

    const stdout = await runPowershell(
      script,
      "localhost",
      winrmUsername,
      password,
      proxyPort,
      winrm.useHttps,
      winrm.rejectUnauthorized,
      winrm.caCert,
      hostname
    );

    if (!stdout.trim()) return [];
    const parsed = JSON.parse(stdout) as TWinRmLocalUser | TWinRmLocalUser[];
    return Array.isArray(parsed) ? parsed : [parsed];
  });
};

export const activeDirectoryDiscoveryFactory: TPamDiscoveryFactory = ({
  gatewayId,
  configuration,
  credentialAccounts,
  gatewayV2Service
}) => {
  const [credentialAccount] = credentialAccounts;
  const connectionDetails = credentialAccount.connectionDetails as unknown as {
    domain: string;
    dcAddress: string;
    port: number;
    rdpPort: number;
    useLdaps: boolean;
    ldapRejectUnauthorized: boolean;
    ldapCaCert?: string;
    ldapTlsServerName?: string;
  };
  const credentials = credentialAccount.credentials as { username: string; password?: string };
  const conn: TAdConnection = { ...connectionDetails, username: credentials.username };
  const config = configuration as {
    scanLocalAccounts?: boolean;
    winrmPort?: number;
    useWinrmHttps?: boolean;
    winrmRejectUnauthorized?: boolean;
    winrmCaCert?: string;
  };

  const validateConnection = async () => {
    await runLdap(conn, credentials, gatewayId, gatewayV2Service, async () => undefined).catch((err) => {
      throw new BadRequestError({
        message: `Unable to connect to Active Directory: ${err instanceof Error ? err.message : "unknown error"}`
      });
    });
  };

  const scan = async (signal: AbortSignal): Promise<TDiscoveryScanResult> => {
    const domain = connectionDetails.domain.toLowerCase();
    const baseDN = buildDomainDN(connectionDetails.domain);
    const machineErrors: TDiscoveryMachineError[] = [];

    const { users, computers } = await runLdap<{ users: TLdapUser[]; computers: TLdapComputer[] }>(
      conn,
      credentials,
      gatewayId,
      gatewayV2Service,
      async (client) => {
        const userEntries = await ldapSearch(client, baseDN, "(&(objectClass=user)(objectCategory=person))", [
          "sAMAccountName",
          "objectGUID"
        ]);
        const parsedUsers = userEntries
          .map((entry) => ({
            sAMAccountName: getAttr(entry, "sAMAccountName"),
            objectGUID: parseObjectGUID(getAttrBuffer(entry, "objectGUID"))
          }))
          .filter((u) => u.sAMAccountName && u.objectGUID);

        if (!config.scanLocalAccounts) return { users: parsedUsers, computers: [] as TLdapComputer[] };

        const computerEntries = await ldapSearch(
          client,
          baseDN,
          "(&(objectClass=computer)(operatingSystem=*Server*))",
          ["cn", "dNSHostName", "objectGUID"]
        );
        const parsedComputers = computerEntries
          .map((entry) => ({
            cn: getAttr(entry, "cn"),
            dNSHostName: getAttr(entry, "dNSHostName"),
            objectGUID: parseObjectGUID(getAttrBuffer(entry, "objectGUID"))
          }))
          .filter((c) => (c.dNSHostName || c.cn) && c.objectGUID);

        return { users: parsedUsers, computers: parsedComputers };
      }
    );

    logger.info(
      `PAM AD discovery enumerated ${users.length} domain accounts and ${computers.length} servers [domain=${domain}]`
    );

    // Domain accounts inherit the source's connection target; only the login user differs
    const domainShortName = domain.split(".")[0];
    const discovered: TDiscoveredAccount[] = users.map((u) => ({
      accountType: PamAccountType.WindowsAd,
      name: slugify(`${domainShortName} ${u.sAMAccountName}`, { lowercase: true })
        .slice(0, 64)
        .replace(TRAILING_HYPHENS_REGEX, ""),
      fingerprint: `${domain}:${u.objectGUID}`,
      details: { connectionDetails, credentials: { username: u.sAMAccountName } }
    }));

    if (config.scanLocalAccounts && computers.length > 0) {
      await resolveHostnamesViaDc(computers, conn, gatewayId, gatewayV2Service);

      const winrm: TWinrmConfig = {
        port: config.winrmPort ?? 5985,
        useHttps: config.useWinrmHttps ?? false,
        rejectUnauthorized: config.winrmRejectUnauthorized ?? true,
        caCert: config.winrmCaCert
      };

      for (const computer of computers) {
        if (signal.aborted) break;
        const host = computer.resolvedIp || computer.dNSHostName || computer.cn;
        const hostLabel = computer.cn || computer.dNSHostName || host;
        try {
          // eslint-disable-next-line no-await-in-loop
          const localUsers = await enumerateLocalUsers(
            computer,
            conn,
            credentials.password ?? "",
            winrm,
            gatewayId,
            gatewayV2Service
          );

          for (const u of localUsers.filter((lu) => lu.Name)) {
            discovered.push({
              accountType: PamAccountType.Windows,
              name: slugify(`${hostLabel} ${u.Name}`, { lowercase: true })
                .slice(0, 64)
                .replace(TRAILING_HYPHENS_REGEX, ""),
              fingerprint: `${domain}:${computer.objectGUID}:${u.Name.toLowerCase()}`,
              details: {
                connectionDetails: { host, port: connectionDetails.rdpPort },
                credentials: { username: u.Name }
              }
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "WinRM enumeration failed";
          logger.warn(err, `PAM AD discovery failed to enumerate local accounts [host=${host}]`);
          machineErrors.push({ machine: host, error: message });
        }
      }
    }

    return { accounts: discovered, machineErrors };
  };

  return { validateConnection, scan };
};
