import net from "node:net";

import slugify from "@sindresorhus/slugify";
import knex from "knex";
import pLimit from "p-limit";
import RE2 from "re2";

import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { PamAccountType } from "../../pam/pam-enums";
import { executeWithGateway, sweepReachableTargets } from "../pam-discovery-fns";
import {
  TDiscoveredAccount,
  TDiscoveryCredentialAccount,
  TDiscoveryMachineError,
  TDiscoveryScanResult,
  TPamDiscoveryFactory
} from "../pam-discovery-types";

const QUERY_TIMEOUT_MS = 20 * 1000;
const SCAN_CONCURRENCY = 32;
const SWEEP_DIAL_TIMEOUT_MS = 3 * 1000;
const MAX_ACCOUNTS_PER_HOST = 2000;
const MAX_ACCOUNTS_PER_SCAN = 50000;
const MAX_ACCOUNT_NAME_LENGTH = 64;
const DEFAULT_PORT = 1433;
const PROXY_HOST = "127.0.0.1";

const SQL_LOGIN_AUTH_METHOD = "sql-login";

// without these a login sees only itself and sa, and reconciliation would treat every other login as gone
const VISIBILITY_QUERY = `SELECT CASE WHEN HAS_PERMS_BY_NAME(NULL, NULL, 'VIEW ANY DEFINITION') = 1 OR HAS_PERMS_BY_NAME(NULL, NULL, 'VIEW ANY SECURITY DEFINITION') = 1 OR HAS_PERMS_BY_NAME(NULL, NULL, 'ALTER ANY LOGIN') = 1 THEN 1 ELSE 0 END AS canSeeLogins, IS_SRVROLEMEMBER('sysadmin') AS isSysadmin, (SELECT COUNT(*) FROM sys.server_permissions p JOIN sys.server_principals g ON g.principal_id = p.grantee_principal_id WHERE p.state = 'D' AND (g.sid = SUSER_SID() OR (g.type = 'R' AND IS_SRVROLEMEMBER(g.name) = 1)) AND ((p.class = 100 AND p.permission_name IN ('VIEW ANY DEFINITION', 'VIEW ANY SECURITY DEFINITION')) OR (p.class = 101 AND p.permission_name IN ('VIEW DEFINITION', 'CONTROL') AND NOT EXISTS (SELECT 1 FROM sys.server_principals r WHERE r.principal_id = p.major_id AND r.type = 'R')))) AS denials`;

// one row past the cap so truncation is detectable; 63 is the longest username a PAM MSSQL account accepts
const ENUMERATION_QUERY = `SELECT TOP (${MAX_ACCOUNTS_PER_HOST + 1}) name, default_database_name AS defaultDatabase, CASE WHEN principal_id = 1 OR sid = SUSER_SID() THEN 1 ELSE 0 END AS alwaysVisible FROM sys.server_principals WHERE type = 'S' AND is_disabled = 0 AND name NOT LIKE '##%##' AND LEN(name) <= 63 ORDER BY name`;

const VISIBILITY_MESSAGE =
  "The credential account can only see its own login. Grant it VIEW ANY DEFINITION or ALTER ANY LOGIN to discover every login on the instance.";
const DENIED_LOGINS_MESSAGE =
  "A DENY permission hides some logins from the credential account, so logins missing from this scan weren't marked stale.";
const OWN_LOGIN_ONLY_MESSAGE =
  "Only sa and the credential account's own login were visible. If the instance has other logins, check that the credential account isn't denied permission to see them.";
const REDIRECT_MESSAGE = "The instance redirected the connection to another server, which discovery doesn't follow";
const GATEWAY_FAILURE_MESSAGE =
  "Could not reach the instance through the gateway. Check that the gateway is online and can reach this host and port.";

type TLogin = { name: string; defaultDatabase: string | null; alwaysVisible: number };

type TInstanceResult = {
  accounts: TDiscoveredAccount[];
  error?: TDiscoveryMachineError;
  machine: string;
  complete: boolean;
};

const describeDriverError = (err: unknown): string => {
  const { code, name, cause } = err as { code?: string; name?: string; cause?: { code?: string } };
  switch (code) {
    case "ELOGIN":
      return "Login failed for the credential account. Check its password, and that its database exists on this instance.";
    case "EENCRYPT":
      return "The instance requires an encrypted connection. Enable SSL on the credential account.";
    case "ETIMEOUT":
      return "Timed out connecting to the instance";
    default:
      break;
  }
  if (name === "KnexTimeoutError") return "Timed out connecting to the instance";

  switch (cause?.code) {
    case "ECONNREFUSED":
      return "Connection refused";
    case "ECONNRESET":
      return "The connection closed before login. Check that SQL Server is listening on this port and that the gateway can reach it.";
    case "ETIMEDOUT":
    case "ENETUNREACH":
    case "EHOSTUNREACH":
      return "Timed out connecting to the instance";
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "UNABLE_TO_GET_ISSUER_CERT_LOCALLY":
      return "TLS verification failed. Add the instance's CA certificate to the credential account, or disable certificate verification.";
    case "CERT_HAS_EXPIRED":
      return "The instance's TLS certificate has expired.";
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return "The instance's TLS certificate isn't valid for this target. List the instance by a name on its certificate, or disable certificate verification.";
    default:
      return "Could not enumerate logins on this instance";
  }
};

const describeScanError = (err: unknown): string =>
  err instanceof BadRequestError ? err.message : "Could not enumerate logins on this instance";

const TRAILING_HYPHENS_REGEX = new RE2(/-+$/);

const toAccountName = (host: string, port: number, login: string) => {
  const suffix = slugify(`${port === DEFAULT_PORT ? "" : port} ${login}`, { lowercase: true })
    .slice(0, MAX_ACCOUNT_NAME_LENGTH)
    .replace(TRAILING_HYPHENS_REGEX, "");
  const room = MAX_ACCOUNT_NAME_LENGTH - suffix.length - 1;
  const prefix = room > 0 ? slugify(host, { lowercase: true }).slice(0, room).replace(TRAILING_HYPHENS_REGEX, "") : "";
  return [prefix, suffix].filter(Boolean).join("-");
};

const NO_USABLE_ACCOUNT_MESSAGE =
  "No credential account can be used to scan. SQL Server discovery requires an account that uses SQL Server authentication with a stored password.";

type TMsSqlAccount = {
  host: string;
  port: number;
  database: string;
  sslEnabled: boolean;
  sslRejectUnauthorized: boolean;
  sslCertificate?: string;
  username: string;
  password?: string;
};

const toMsSqlAccount = (account: TDiscoveryCredentialAccount): TMsSqlAccount => {
  const connectionDetails = account.connectionDetails as {
    host: string;
    port: number;
    database: string;
    sslEnabled?: boolean;
    sslRejectUnauthorized?: boolean;
    sslCertificate?: string;
  };
  const credentials = account.credentials as { authMethod?: string; username: string; password?: string };
  return {
    host: connectionDetails.host,
    port: connectionDetails.port,
    database: connectionDetails.database,
    sslEnabled: Boolean(connectionDetails.sslEnabled),
    sslRejectUnauthorized: connectionDetails.sslRejectUnauthorized !== false,
    sslCertificate: connectionDetails.sslCertificate,
    username: credentials.username,
    // NTLM and Kerberos logins authenticate inside the gateway, so the backend can't scan with them
    password: credentials.authMethod === SQL_LOGIN_AUTH_METHOD ? credentials.password : undefined
  };
};

const isUsableAccount = (account: TMsSqlAccount) => Boolean(account.password);

export const msSqlDiscoveryFactory: TPamDiscoveryFactory = ({
  gatewayId,
  configuration,
  credentialAccounts,
  gatewayV2Service
}) => {
  const accounts = credentialAccounts.map(toMsSqlAccount);
  const config = configuration as { hosts: string[] };

  const enumerateInstance = async (host: string, port: number, account: TMsSqlAccount) => {
    let failure: string | undefined;
    try {
      return await executeWithGateway(host, port, gatewayId, gatewayV2Service, async (proxyPort) => {
        let redirected = false;
        const connector = ({ host: dialHost, port: dialPort }: { host: string; port: number }) =>
          new Promise<net.Socket>((resolve, reject) => {
            if (dialHost !== PROXY_HOST || dialPort !== proxyPort) {
              redirected = true;
              reject(new Error("Refused a server-sent redirect"));
              return;
            }
            const socket = net.connect({ host: PROXY_HOST, port: proxyPort });
            socket.once("error", reject);
            socket.once("connect", () => {
              socket.off("error", reject);
              resolve(socket);
            });
          });
        const options = {
          encrypt: account.sslEnabled,
          connector,
          // each transient-error retry would send the password to the instance again
          maxRetriesOnTransientErrors: 0,
          ...(account.sslEnabled
            ? {
                trustServerCertificate: !account.sslRejectUnauthorized,
                // the driver dials the local proxy, so the certificate is checked against the real host instead
                serverName: host,
                cryptoCredentialsDetails: account.sslCertificate ? { ca: account.sslCertificate } : {}
              }
            : {})
        };
        const db = knex({
          client: "mssql",
          connection: {
            server: PROXY_HOST,
            port: proxyPort,
            database: account.database,
            user: account.username,
            password: account.password,
            connectionTimeout: QUERY_TIMEOUT_MS,
            requestTimeout: QUERY_TIMEOUT_MS,
            options
          },
          acquireConnectionTimeout: QUERY_TIMEOUT_MS,
          pool: { min: 0, max: 1 }
        });

        try {
          const [visibility] =
            await db.raw<{ canSeeLogins: number; isSysadmin: number | null; denials: number }[]>(VISIBILITY_QUERY);
          if (visibility?.canSeeLogins !== 1) {
            failure = VISIBILITY_MESSAGE;
            throw new Error(failure);
          }
          const logins = await db.raw<TLogin[]>(ENUMERATION_QUERY);
          return { logins, isSysadmin: visibility.isSysadmin === 1, denials: visibility.denials };
        } catch (err) {
          if (!failure) {
            logger.warn({ err }, `PAM SQL Server discovery query failed [host=${host}] [port=${port}]`);
            failure = redirected ? REDIRECT_MESSAGE : describeDriverError(err);
          }
          throw err;
        } finally {
          await db.destroy();
        }
      });
    } catch (err) {
      // withGatewayV2Proxy rethrows only a message, sometimes its own transport error, so the mapped one wins
      if (failure) throw new BadRequestError({ message: failure });
      logger.warn({ err }, `PAM SQL Server discovery could not reach instance [host=${host}] [port=${port}]`);
      throw new BadRequestError({ message: GATEWAY_FAILURE_MESSAGE });
    }
  };

  const scanInstance = async (host: string, port: number, signal: AbortSignal): Promise<TInstanceResult> => {
    const machine = `${host}:${port}`;
    const candidates = [
      ...accounts.filter((a) => a.host === host && a.port === port),
      ...accounts.filter((a) => a.host !== host || a.port !== port)
    ].filter(isUsableAccount);

    const toResult = (account: TMsSqlAccount, logins: TLogin[], error?: string): TInstanceResult => ({
      machine,
      complete: !error,
      ...(error ? { error: { machine, error } } : {}),
      accounts: logins.slice(0, MAX_ACCOUNTS_PER_HOST).map((login) => ({
        accountType: PamAccountType.MsSQL,
        name: toAccountName(host, port, login.name),
        fingerprint: `${machine}:${login.name}`,
        details: {
          connectionDetails: {
            host,
            port,
            database: login.defaultDatabase || account.database,
            sslEnabled: account.sslEnabled,
            sslRejectUnauthorized: account.sslRejectUnauthorized,
            ...(account.sslCertificate ? { sslCertificate: account.sslCertificate } : {})
          },
          credentials: { authMethod: SQL_LOGIN_AUTH_METHOD, username: login.name }
        }
      }))
    });

    let lastError = "No credential account could authenticate";
    let matchedError: string | undefined;
    let partial: TInstanceResult | undefined;
    const loggedIn = new Set<string>();
    for (const account of candidates) {
      if (signal.aborted) return { accounts: [], machine, complete: false };
      // another account for a login that already got in sees the same logins, and would only send it another password
      if (loggedIn.has(account.username.toLowerCase())) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const { logins, isSysadmin, denials } = await enumerateInstance(host, port, account);
        if (logins.length > MAX_ACCOUNTS_PER_HOST) {
          logger.warn(
            `PAM SQL Server discovery truncated an instance at the per-instance limit [machine=${machine}] [limit=${MAX_ACCOUNTS_PER_HOST}]`
          );
          return toResult(
            account,
            logins,
            `Instance has more than ${MAX_ACCOUNTS_PER_HOST} logins; only the first ${MAX_ACCOUNTS_PER_HOST} were staged`
          );
        }
        // a DENY can hide logins without failing the permission check (sysadmin is exempt from DENY), so a list it may
        // have cut is kept as a fallback while the other credentials are tried
        let hidden: string | undefined;
        if (!isSysadmin && denials > 0) hidden = DENIED_LOGINS_MESSAGE;
        else if (!isSysadmin && logins.every((login) => login.alwaysVisible === 1)) hidden = OWN_LOGIN_ONLY_MESSAGE;
        if (!hidden) return toResult(account, logins);
        partial ??= toResult(account, logins, hidden);
        loggedIn.add(account.username.toLowerCase());
      } catch (err) {
        logger.warn({ err }, `PAM SQL Server discovery failed to scan instance [machine=${machine}]`);
        lastError = describeScanError(err);
        // the account stored for this instance explains a failure better than one tried as a fallback
        if (account.host === host && account.port === port) matchedError ??= lastError;
      }
    }

    if (partial) return partial;
    if (candidates.length) {
      return { accounts: [], error: { machine, error: matchedError ?? lastError }, machine, complete: false };
    }
    return { accounts: [], machine, complete: false };
  };

  const validateConnection = async () => {
    const account = accounts.find(isUsableAccount);
    if (!account) throw new BadRequestError({ message: NO_USABLE_ACCOUNT_MESSAGE });
    await enumerateInstance(account.host, account.port, account).catch((err: unknown) => {
      logger.warn({ err }, `PAM SQL Server discovery connection test failed [host=${account.host}]`);
      throw new BadRequestError({ message: `Unable to connect to SQL Server: ${describeScanError(err)}` });
    });
  };

  const scan = async (signal: AbortSignal): Promise<TDiscoveryScanResult> => {
    if (!accounts.some(isUsableAccount)) throw new BadRequestError({ message: NO_USABLE_ACCOUNT_MESSAGE });

    const targets = [...new Set(config.hosts.map((host) => host.trim()).filter(Boolean))];
    const usablePorts = [...new Set(accounts.filter(isUsableAccount).map((a) => a.port))];
    const candidatePairs = targets.flatMap((host) => usablePorts.map((port) => ({ host, port })));

    const open = await sweepReachableTargets(
      candidatePairs,
      gatewayId,
      gatewayV2Service,
      SWEEP_DIAL_TIMEOUT_MS,
      signal
    );

    const instancesToScan = candidatePairs.filter(
      ({ host, port }) => open.has(`${host}:${port}`) || accounts.some((a) => a.host === host && a.port === port)
    );

    if (!instancesToScan.length) {
      throw new BadRequestError({
        message:
          "None of the targets were reachable on the credential accounts' ports. Check the hosts, that the gateway can reach them, and that SQL Server is listening."
      });
    }

    const limit = pLimit(SCAN_CONCURRENCY);
    const results = await Promise.all(
      instancesToScan.map(({ host, port }) => limit(() => scanInstance(host, port, signal)))
    );

    const scannedHosts = new Set(instancesToScan.map(({ host }) => host));
    const machineErrors: TDiscoveryMachineError[] = targets
      .filter((host) => !scannedHosts.has(host))
      .map((host) => ({
        machine: host,
        error: `Not reachable through the gateway on the credential accounts' ports (${usablePorts.join(", ")})`
      }));
    const discovered: TDiscoveredAccount[] = [];
    const scannedAccountMachines: string[] = [];
    let droppedInstances = 0;
    for (const result of results) {
      if (discovered.length + result.accounts.length > MAX_ACCOUNTS_PER_SCAN) {
        droppedInstances += 1;
        machineErrors.push({
          machine: result.machine,
          error: `The scan reached its limit of ${MAX_ACCOUNTS_PER_SCAN} accounts, so this instance's logins were not staged`
        });
      } else {
        discovered.push(...result.accounts);
        if (result.complete) scannedAccountMachines.push(result.machine);
        if (result.error) machineErrors.push(result.error);
      }
    }
    if (droppedInstances) {
      logger.warn(
        `PAM SQL Server discovery dropped instances at the per-scan limit [instances=${droppedInstances}] [limit=${MAX_ACCOUNTS_PER_SCAN}]`
      );
    }

    // logins that slugify alike, or names cut to the length limit, would collide on import into one folder
    const nameCounts = new Map<string, number>();
    discovered.forEach(({ name }) => nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1));
    const staged = discovered.map((account) => {
      if ((nameCounts.get(account.name) ?? 0) < 2) return account;
      const hash = crypto.nativeCrypto.createHash("sha256").update(account.fingerprint).digest("hex").slice(0, 6);
      const base = account.name.slice(0, MAX_ACCOUNT_NAME_LENGTH - hash.length - 1).replace(TRAILING_HYPHENS_REGEX, "");
      return { ...account, name: `${base}-${hash}` };
    });

    return {
      accounts: staged,
      machineErrors,
      dependencies: [],
      scannedDependencyMachines: [],
      scannedAccountMachines
    };
  };

  return { validateConnection, scan };
};
