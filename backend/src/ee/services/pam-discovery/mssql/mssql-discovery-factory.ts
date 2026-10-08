import net from "node:net";

import slugify from "@sindresorhus/slugify";
import knex from "knex";
import pLimit from "p-limit";
import RE2 from "re2";

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
const REDIRECT_REFUSED = "EREDIRECTREFUSED";

const SQL_LOGIN_AUTH_METHOD = "sql-login";

// without these a login sees only itself and sa, and reconciliation would treat every other login as gone
const VISIBILITY_QUERY = `SELECT CASE WHEN HAS_PERMS_BY_NAME(NULL, NULL, 'VIEW ANY DEFINITION') = 1 OR HAS_PERMS_BY_NAME(NULL, NULL, 'VIEW ANY SECURITY DEFINITION') = 1 OR HAS_PERMS_BY_NAME(NULL, NULL, 'ALTER ANY LOGIN') = 1 THEN 1 ELSE 0 END AS canSeeLogins`;

// one row past the cap so truncation is detectable; 63 is the longest username a PAM MSSQL account accepts
const ENUMERATION_QUERY = `SELECT TOP (${MAX_ACCOUNTS_PER_HOST + 1}) name FROM sys.server_principals WHERE type = 'S' AND is_disabled = 0 AND name NOT LIKE '##%##' AND LEN(name) <= 63 ORDER BY name`;

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
    case REDIRECT_REFUSED:
      return "The instance redirected the connection to another server, which discovery doesn't follow";
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
      return "TLS verification failed. Add the instance's CA certificate to the credential account, or disable certificate verification.";
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
  return prefix ? `${prefix}-${suffix}` : suffix;
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

  const enumerateInstance = (host: string, port: number, account: TMsSqlAccount) =>
    executeWithGateway(host, port, gatewayId, gatewayV2Service, async (proxyPort) => {
      const connector = ({ host: dialHost, port: dialPort }: { host: string; port: number }) =>
        new Promise<net.Socket>((resolve, reject) => {
          if (dialHost !== PROXY_HOST || dialPort !== proxyPort) {
            reject(Object.assign(new Error("Refused a server-sent redirect"), { code: REDIRECT_REFUSED }));
            return;
          }
          const socket = net.connect({ host: PROXY_HOST, port: proxyPort });
          socket.once("error", reject);
          socket.once("connect", () => {
            socket.off("error", reject);
            resolve(socket);
          });
        });
      const options = account.sslEnabled
        ? {
            encrypt: true,
            trustServerCertificate: !account.sslRejectUnauthorized,
            // the driver dials the local proxy, so the certificate is checked against the real host instead
            serverName: host,
            cryptoCredentialsDetails: account.sslCertificate ? { ca: account.sslCertificate } : {},
            connector
          }
        : { encrypt: false, connector };
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
        const [visibility] = await db.raw<{ canSeeLogins: number }[]>(VISIBILITY_QUERY);
        if (visibility?.canSeeLogins !== 1) {
          throw new BadRequestError({
            message:
              "The credential account can only see its own login. Grant it VIEW ANY DEFINITION or ALTER ANY LOGIN to discover every login on the instance."
          });
        }
        const rows = await db.raw<{ name: string }[]>(ENUMERATION_QUERY);
        return rows.map((row) => row.name);
      } catch (err) {
        if (err instanceof BadRequestError) throw err;
        // withGatewayV2Proxy rethrows only the message, so the driver error code has to be mapped here
        logger.warn({ err }, `PAM SQL Server discovery query failed [host=${host}] [port=${port}]`);
        throw new BadRequestError({ message: describeDriverError(err) });
      } finally {
        await db.destroy();
      }
    });

  const scanInstance = async (
    host: string,
    port: number,
    signal: AbortSignal
  ): Promise<{
    accounts: TDiscoveredAccount[];
    error?: TDiscoveryMachineError;
    machine: string;
    complete: boolean;
  }> => {
    const machine = `${host}:${port}`;
    const candidates = [
      ...accounts.filter((a) => a.host === host && a.port === port),
      ...accounts.filter((a) => a.host !== host || a.port !== port)
    ].filter(isUsableAccount);

    let lastError = "No credential account could authenticate";
    for (const account of candidates) {
      if (signal.aborted) return { accounts: [], machine, complete: false };
      try {
        // eslint-disable-next-line no-await-in-loop
        const logins = await enumerateInstance(host, port, account);
        const complete = logins.length <= MAX_ACCOUNTS_PER_HOST;
        if (!complete) {
          logger.warn(
            `PAM SQL Server discovery truncated an instance at the per-instance limit [machine=${machine}] [limit=${MAX_ACCOUNTS_PER_HOST}]`
          );
        }
        return {
          machine,
          complete,
          ...(complete
            ? {}
            : {
                error: {
                  machine,
                  error: `Instance has more than ${MAX_ACCOUNTS_PER_HOST} logins; only the first ${MAX_ACCOUNTS_PER_HOST} were staged`
                }
              }),
          accounts: logins.slice(0, MAX_ACCOUNTS_PER_HOST).map((login) => ({
            accountType: PamAccountType.MsSQL,
            name: toAccountName(host, port, login),
            fingerprint: `${machine}:${login}`,
            details: {
              connectionDetails: {
                host,
                port,
                database: account.database,
                sslEnabled: account.sslEnabled,
                sslRejectUnauthorized: account.sslRejectUnauthorized,
                ...(account.sslCertificate ? { sslCertificate: account.sslCertificate } : {})
              },
              credentials: { authMethod: SQL_LOGIN_AUTH_METHOD, username: login }
            }
          }))
        };
      } catch (err) {
        logger.warn({ err }, `PAM SQL Server discovery failed to scan instance [machine=${machine}]`);
        lastError = describeScanError(err);
      }
    }

    if (candidates.length) return { accounts: [], error: { machine, error: lastError }, machine, complete: false };
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

    const discovered: TDiscoveredAccount[] = [];
    const scannedAccountMachines: string[] = [];
    const machineErrors: TDiscoveryMachineError[] = [];
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

    return {
      accounts: discovered,
      machineErrors,
      dependencies: [],
      scannedDependencyMachines: [],
      scannedAccountMachines
    };
  };

  return { validateConnection, scan };
};
