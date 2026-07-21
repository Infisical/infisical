import net from "node:net";

import ldapjs from "@infisical/ldapjs";
import slugify from "@sindresorhus/slugify";
import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";
import { WinRmRpcEndpoint } from "@app/lib/gateway-v2/winrm-rpc";
import { logger } from "@app/lib/logger";

import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { PamAccountType } from "../../pam/pam-enums";
import { isDomainQualifiedUsername, toNetbiosUsername } from "../../pam-account/pam-account-schemas";
import { executeWithGateway, winrmRpcWithGateway } from "../pam-discovery-fns";
import {
  TDiscoveredAccount,
  TDiscoveredDependency,
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

const buildWinrmCredentials = (conn: TAdConnection, password: string, winrm: TWinrmConfig) => ({
  username: toNetbiosUsername(conn.username, conn.domain),
  password,
  useHttps: winrm.useHttps,
  // WinRM `insecure` skips cert verification (HTTPS only); it maps from the source's reject-unauthorized flag.
  insecure: winrm.useHttps && !winrm.rejectUnauthorized,
  caCertificate: winrm.caCert
});

const enumerateLocalUsers = async (
  computer: TLdapComputer,
  conn: TAdConnection,
  password: string,
  winrm: TWinrmConfig,
  gatewayId: string,
  gatewayV2Service: TGatewayDep
): Promise<TWinRmLocalUser[]> => {
  const targetAddress = computer.resolvedIp || computer.dNSHostName || computer.cn;
  const { accounts } = await winrmRpcWithGateway<{ accounts: TWinRmLocalUser[] }>({
    targetHost: targetAddress,
    targetPort: winrm.port,
    gatewayId,
    gatewayV2Service,
    endpoint: WinRmRpcEndpoint.EnumerateAccounts,
    credentials: buildWinrmCredentials(conn, password, winrm)
  });
  return (accounts ?? []).filter((u) => u.Name);
};

type TWinRmDependency = { type: string; runAs: string; name: string; data: Record<string, unknown> };

// Run-as values that are built-in service identities: they have no password, so nothing to rotate.
const BUILTIN_RUNAS = new Set(["localsystem", "system", "localservice", "networkservice", "applicationpoolidentity"]);

// Split a run-as into its domain qualifier (null when unqualified) and account name; null for built-ins/empty.
export const parseRunAs = (runAs: string): { domain: string | null; account: string } | null => {
  const value = runAs.trim();
  if (!value) return null;
  if (value.includes("\\")) {
    const [domainPart, user] = value.split("\\");
    const dp = domainPart.toLowerCase();
    if (dp === "nt authority" || dp === "nt service" || dp === "builtin") return null;
    if (!user) return null;
    return { domain: domainPart, account: user };
  }
  if (value.includes("@")) {
    const [user, suffix] = value.split("@");
    return { domain: suffix, account: user };
  }
  return { domain: null, account: value };
};

// Retained for the account-name extraction; the fingerprint resolver below adds the domain check.
export const extractSamAccountName = (runAs: string): string | null => parseRunAs(runAs)?.account ?? null;

// Anchor a dependency's run-as to a domain account's stable identity (domain:objectGUID), matching the
// fingerprint minted for discovered domain accounts. Returns null for built-ins and any run-as that doesn't
// resolve to an enumerated domain user (local/unknown accounts are not tracked as dependencies). A qualified
// run-as must name the scanned domain, so a same-named local or trusted-domain account (e.g. WEB01\svc-sql)
// is never mis-anchored to the domain account.
export const resolveRunAsFingerprint = (
  runAs: string,
  domain: string,
  userGuidByName: Map<string, string>,
  netbiosName?: string | null,
  // The machine currently being swept; lets a local run-as anchor to that machine's local account.
  machine?: { objectGUID: string; name: string }
): string | null => {
  const parsed = parseRunAs(runAs);
  if (!parsed) return null;
  const account = parsed.account.toLowerCase();
  if (BUILTIN_RUNAS.has(account)) return null;

  if (parsed.domain !== null) {
    const runAsDomain = parsed.domain.toLowerCase();

    // Local run-as (.\user or MACHINE\user for this machine) anchors to the machine's local account, whose
    // fingerprint mirrors how enumerateLocalUsers mints it: domain:machineObjectGUID:username.
    if (machine && (runAsDomain === "." || runAsDomain === machine.name.toLowerCase())) {
      return `${domain}:${machine.objectGUID}:${account}`;
    }

    // Domain run-as: accept the DNS first label, the FQDN, or the real NetBIOS name (which can differ).
    const accepted = [domain.split(".")[0], domain, netbiosName]
      .filter((d): d is string => Boolean(d))
      .map((d) => d.toLowerCase());
    if (!accepted.includes(runAsDomain)) return null;
  }

  const guid = userGuidByName.get(account);
  if (!guid) return null;
  return `${domain}:${guid}`;
};

const enumerateDependencies = async (
  computer: TLdapComputer,
  conn: TAdConnection,
  password: string,
  winrm: TWinrmConfig,
  gatewayId: string,
  gatewayV2Service: TGatewayDep
): Promise<TWinRmDependency[]> => {
  const targetAddress = computer.resolvedIp || computer.dNSHostName || computer.cn;
  const { dependencies } = await winrmRpcWithGateway<{ dependencies: TWinRmDependency[] }>({
    targetHost: targetAddress,
    targetPort: winrm.port,
    gatewayId,
    gatewayV2Service,
    endpoint: WinRmRpcEndpoint.EnumerateDependencies,
    credentials: buildWinrmCredentials(conn, password, winrm)
  });
  return dependencies ?? [];
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
    discoverDependencies?: boolean;
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
    const dependencies: TDiscoveredDependency[] = [];
    const scannedDependencyMachines: string[] = [];
    // Both local-account and dependency sweeps need the machine list from LDAP.
    const enumerateComputers = Boolean(config.scanLocalAccounts || config.discoverDependencies);

    const { users, computers, netbiosName } = await runLdap<{
      users: TLdapUser[];
      computers: TLdapComputer[];
      netbiosName: string | null;
    }>(conn, credentials, gatewayId, gatewayV2Service, async (client) => {
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

      if (!enumerateComputers) return { users: parsedUsers, computers: [] as TLdapComputer[], netbiosName: null };

      const computerEntries = await ldapSearch(client, baseDN, "(&(objectClass=computer)(operatingSystem=*Server*))", [
        "cn",
        "dNSHostName",
        "objectGUID"
      ]);
      const parsedComputers = computerEntries
        .map((entry) => ({
          cn: getAttr(entry, "cn"),
          dNSHostName: getAttr(entry, "dNSHostName"),
          objectGUID: parseObjectGUID(getAttrBuffer(entry, "objectGUID"))
        }))
        .filter((c) => (c.dNSHostName || c.cn) && c.objectGUID);

      // The real NetBIOS domain name can differ from the DNS first label (renamed/legacy domains). Read it from
      // the Partitions container so a NETBIOS\user run-as isn't wrongly rejected and its dependencies dropped.
      let resolvedNetbios: string | null = null;
      try {
        const partitions = await ldapSearch(
          client,
          `CN=Partitions,CN=Configuration,${baseDN}`,
          `(&(objectClass=crossRef)(nETBIOSName=*)(nCName=${baseDN}))`,
          ["nETBIOSName"]
        );
        resolvedNetbios = partitions.length ? getAttr(partitions[0], "nETBIOSName") || null : null;
      } catch (err) {
        logger.warn(err, `PAM AD discovery could not read the NetBIOS name; using the DNS label [domain=${domain}]`);
      }

      return { users: parsedUsers, computers: parsedComputers, netbiosName: resolvedNetbios };
    });

    logger.info(
      `PAM AD discovery enumerated ${users.length} domain accounts and ${computers.length} servers [domain=${domain}]`
    );

    // Carry the source's WinRM settings onto imported accounts so rotation and dependency sync honor HTTPS /
    // a custom port / a pinned CA (the account connection schema has no separate WinRM discovery step).
    const winrmConnDetails = {
      winrmPort: config.winrmPort ?? 5985,
      useWinrmHttps: config.useWinrmHttps ?? false,
      winrmRejectUnauthorized: config.winrmRejectUnauthorized ?? true,
      ...(config.winrmCaCert ? { winrmCaCert: config.winrmCaCert } : {})
    };

    // Domain accounts inherit the source's connection target; only the login user differs
    const domainShortName = domain.split(".")[0];
    const discovered: TDiscoveredAccount[] = users.map((u) => ({
      accountType: PamAccountType.WindowsAd,
      name: slugify(`${domainShortName} ${u.sAMAccountName}`, { lowercase: true })
        .slice(0, 64)
        .replace(TRAILING_HYPHENS_REGEX, ""),
      fingerprint: `${domain}:${u.objectGUID}`,
      details: {
        connectionDetails: { ...connectionDetails, ...winrmConnDetails },
        credentials: { username: u.sAMAccountName }
      }
    }));

    if (enumerateComputers && computers.length > 0) {
      // A DC unreachable on TCP/53 must not abort the whole scan (account enumeration already succeeded);
      // WinRM then falls back to the hostname, which resolves in environments where the gateway has DNS.
      try {
        await resolveHostnamesViaDc(computers, conn, gatewayId, gatewayV2Service);
      } catch (err) {
        logger.warn(err, `PAM AD discovery could not resolve hostnames via the DC; using hostnames [domain=${domain}]`);
      }

      const winrm: TWinrmConfig = {
        port: config.winrmPort ?? 5985,
        useHttps: config.useWinrmHttps ?? false,
        rejectUnauthorized: config.winrmRejectUnauthorized ?? true,
        caCert: config.winrmCaCert
      };
      const password = credentials.password ?? "";
      // Resolve a dependency's run-as (DOMAIN\user / user@domain / user) to its domain account's objectGUID.
      const userGuidByName = new Map(users.map((u) => [u.sAMAccountName.toLowerCase(), u.objectGUID]));

      for (const computer of computers) {
        if (signal.aborted) break;
        const host = computer.resolvedIp || computer.dNSHostName || computer.cn;
        const hostLabel = computer.cn || computer.dNSHostName || host;
        const machineName = computer.dNSHostName || computer.cn;

        if (config.scanLocalAccounts) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const localUsers = await enumerateLocalUsers(computer, conn, password, winrm, gatewayId, gatewayV2Service);

            for (const u of localUsers.filter((lu) => lu.Name)) {
              discovered.push({
                accountType: PamAccountType.Windows,
                name: slugify(`${hostLabel} ${u.Name}`, { lowercase: true })
                  .slice(0, 64)
                  .replace(TRAILING_HYPHENS_REGEX, ""),
                fingerprint: `${domain}:${computer.objectGUID}:${u.Name.toLowerCase()}`,
                details: {
                  connectionDetails: { host, port: connectionDetails.rdpPort, ...winrmConnDetails },
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

        if (config.discoverDependencies) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const machineDeps = await enumerateDependencies(
              computer,
              conn,
              password,
              winrm,
              gatewayId,
              gatewayV2Service
            );

            for (const dep of machineDeps) {
              // built-in run-as resolves to null: nothing to anchor to an account or rotate. A local run-as
              // anchors to this machine's local account; a domain run-as to the enumerated domain user.
              const fingerprint = resolveRunAsFingerprint(dep.runAs, domain, userGuidByName, netbiosName, {
                objectGUID: computer.objectGUID,
                name: computer.cn
              });
              if (fingerprint) {
                dependencies.push({
                  fingerprint,
                  type: dep.type,
                  name: dep.name,
                  // machine stays the hostname (stable reconciliation identity); the resolved IP is carried in
                  // data so rotation sync can connect even where the gateway can't resolve AD hostnames.
                  machine: machineName,
                  data: computer.resolvedIp ? { ...dep.data, resolvedIp: computer.resolvedIp } : dep.data
                });
              }
            }
            scannedDependencyMachines.push(machineName);
          } catch (err) {
            const message = err instanceof Error ? err.message : "WinRM dependency enumeration failed";
            logger.warn(err, `PAM AD discovery failed to enumerate dependencies [host=${host}]`);
            machineErrors.push({ machine: host, error: message });
          }
        }
      }
    }

    return { accounts: discovered, machineErrors, dependencies, scannedDependencyMachines };
  };

  return { validateConnection, scan };
};
