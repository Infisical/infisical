import slugify from "@sindresorhus/slugify";
import knex from "knex";
import pLimit from "p-limit";
import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { PamAccountType, PamPostgresAuthMethod } from "../../pam/pam-enums";
import { executeWithGateway, sweepReachableTargets } from "../pam-discovery-fns";
import { expandTargets } from "../pam-discovery-targets";
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
const MAX_SWEEP_TARGETS = 65536;
const MAX_ACCOUNTS_PER_HOST = 2000;
const MAX_ACCOUNTS_PER_SCAN = 50000;

// one row past the cap, so a capped instance is detectable and can be excluded from reconciliation
const ENUMERATION_QUERY = `SELECT rolname FROM pg_roles WHERE rolcanlogin ORDER BY rolname LIMIT ${MAX_ACCOUNTS_PER_HOST + 1}`;

// pg surfaces auth/TLS/connection failures with driver-level detail; map the ones a user can act on and keep the
// raw error to the log, so the run's machine errors stay stable and free of database internals
const describeConnectionError = (err: unknown): string => {
  const code = (err as { code?: string })?.code;
  switch (code) {
    case "28P01":
    case "28000":
      return "Authentication failed for the credential account";
    case "3D000":
      return "The credential account's database does not exist on this instance";
    case "53300":
      return "The instance refused the connection because it is out of connection slots";
    case "ECONNREFUSED":
      return "Connection refused";
    case "ETIMEDOUT":
    case "ENETUNREACH":
    case "EHOSTUNREACH":
      return "Timed out connecting to the instance";
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      return "TLS verification failed. Add the instance's CA certificate to the credential account, or disable certificate verification.";
    default:
      return "Could not enumerate roles on this instance";
  }
};

const TRAILING_HYPHENS_REGEX = new RE2(/-+$/);

type TPostgresAccount = {
  host: string;
  port: number;
  database: string;
  sslEnabled: boolean;
  sslRejectUnauthorized: boolean;
  sslCertificate?: string;
  username: string;
  password?: string;
};

const toPostgresAccount = (account: TDiscoveryCredentialAccount): TPostgresAccount => {
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
    password: credentials.authMethod === PamPostgresAuthMethod.AwsIam ? undefined : credentials.password
  };
};

// an IAM token is minted per host/port/user pair, which a sweep across arbitrary targets cannot do, so only password accounts can drive a scan
const isUsableAccount = (account: TPostgresAccount) => Boolean(account.password);

export const postgresDiscoveryFactory: TPamDiscoveryFactory = ({
  gatewayId,
  configuration,
  credentialAccounts,
  gatewayV2Service
}) => {
  const accounts = credentialAccounts.map(toPostgresAccount);
  const config = configuration as { cidrRanges: string[] };

  const enumerateInstance = (host: string, port: number, account: TPostgresAccount) =>
    executeWithGateway(host, port, gatewayId, gatewayV2Service, async (proxyPort) => {
      const db = knex({
        client: "pg",
        connection: {
          host: "localhost",
          port: proxyPort,
          database: account.database,
          user: account.username,
          password: account.password,
          connectionTimeoutMillis: QUERY_TIMEOUT_MS,
          statement_timeout: QUERY_TIMEOUT_MS,
          query_timeout: QUERY_TIMEOUT_MS,
          ssl: account.sslEnabled
            ? {
                rejectUnauthorized: account.sslRejectUnauthorized,
                servername: host,
                ...(account.sslCertificate ? { ca: account.sslCertificate } : {})
              }
            : false
        },
        acquireConnectionTimeout: QUERY_TIMEOUT_MS,
        pool: { min: 0, max: 1 }
      });

      try {
        const result = await db.raw<{ rows: { rolname: string }[] }>(ENUMERATION_QUERY);
        return result.rows.map((row) => row.rolname);
      } finally {
        await db.destroy();
      }
    });

  // an instance is scanned as a host:port pair, not a host: one machine can run several clusters on different
  // ports, and collapsing them would enumerate only the first one that answered
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
    if (signal.aborted) return { accounts: [], machine, complete: false };

    const candidates = [
      ...accounts.filter((a) => a.host === host && a.port === port),
      ...accounts.filter((a) => a.host !== host || a.port !== port)
    ].filter(isUsableAccount);

    let lastError = "No credential account could authenticate";
    for (const account of candidates) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const rolnames = await enumerateInstance(host, port, account);
        const complete = rolnames.length <= MAX_ACCOUNTS_PER_HOST;
        if (!complete) {
          logger.warn(
            `PAM PostgreSQL discovery truncated an instance at the per-instance limit [machine=${machine}] [limit=${MAX_ACCOUNTS_PER_HOST}]`
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
                  error: `Instance has more than ${MAX_ACCOUNTS_PER_HOST} login roles; only the first ${MAX_ACCOUNTS_PER_HOST} were staged`
                }
              }),
          accounts: rolnames.slice(0, MAX_ACCOUNTS_PER_HOST).map((rolname) => ({
            accountType: PamAccountType.Postgres,
            name: slugify(`${host} ${rolname}`, { lowercase: true }).slice(0, 64).replace(TRAILING_HYPHENS_REGEX, ""),
            fingerprint: `${machine}:${rolname}`,
            details: {
              connectionDetails: {
                host,
                port,
                database: account.database,
                sslEnabled: account.sslEnabled,
                sslRejectUnauthorized: account.sslRejectUnauthorized,
                ...(account.sslCertificate ? { sslCertificate: account.sslCertificate } : {})
              },
              credentials: { authMethod: PamPostgresAuthMethod.Password, username: rolname }
            }
          }))
        };
      } catch (err) {
        logger.warn({ err }, `PAM PostgreSQL discovery failed to scan instance [machine=${machine}]`);
        lastError = describeConnectionError(err);
      }
    }

    if (candidates.length) return { accounts: [], error: { machine, error: lastError }, machine, complete: false };
    return { accounts: [], machine, complete: false };
  };

  const validateConnection = async () => {
    const account = accounts.find(isUsableAccount);
    if (!account) {
      throw new BadRequestError({
        message:
          "No credential account has a password. PostgreSQL discovery requires password authentication; AWS IAM accounts cannot be used to scan."
      });
    }
    await enumerateInstance(account.host, account.port, account).catch((err: unknown) => {
      logger.warn({ err }, `PAM PostgreSQL discovery connection test failed [host=${account.host}]`);
      throw new BadRequestError({ message: `Unable to connect to PostgreSQL: ${describeConnectionError(err)}` });
    });
  };

  const scan = async (signal: AbortSignal): Promise<TDiscoveryScanResult> => {
    if (!accounts.some(isUsableAccount)) {
      throw new BadRequestError({
        message:
          "No credential account has a password. PostgreSQL discovery requires password authentication; AWS IAM accounts cannot be used to scan."
      });
    }

    const targets = expandTargets(config.cidrRanges);
    const usablePorts = [...new Set(accounts.filter(isUsableAccount).map((a) => a.port))];

    const sweepTargets = targets.flatMap((host) => usablePorts.map((port) => ({ host, port })));
    if (sweepTargets.length > MAX_SWEEP_TARGETS) {
      throw new BadRequestError({
        message: `Scan expands to ${sweepTargets.length} host-port combinations, exceeding the limit of ${MAX_SWEEP_TARGETS}. Reduce the target ranges or the number of distinct credential ports.`
      });
    }
    const open = await sweepReachableTargets(sweepTargets, gatewayId, gatewayV2Service, SWEEP_DIAL_TIMEOUT_MS, signal);

    // scan every reachable host:port pair, plus any pair a credential account names outright
    const instancesToScan = sweepTargets.filter(
      ({ host, port }) => open.has(`${host}:${port}`) || accounts.some((a) => a.host === host && a.port === port)
    );

    if (!instancesToScan.length) {
      throw new BadRequestError({
        message:
          "No hosts were reachable on the credential ports in the target range. Check the targets, that the gateway can reach them, and that PostgreSQL is listening."
      });
    }

    const limit = pLimit(SCAN_CONCURRENCY);
    const results = await Promise.all(
      instancesToScan.map(({ host, port }) => limit(() => scanInstance(host, port, signal)))
    );

    const discovered: TDiscoveredAccount[] = [];
    const scannedAccountMachines: string[] = [];
    let droppedInstances = 0;
    for (const result of results) {
      if (discovered.length + result.accounts.length > MAX_ACCOUNTS_PER_SCAN) {
        droppedInstances += 1;
      } else {
        discovered.push(...result.accounts);
        if (result.complete) scannedAccountMachines.push(result.machine);
      }
    }
    if (droppedInstances) {
      logger.warn(
        `PAM PostgreSQL discovery dropped instances at the per-scan limit [instances=${droppedInstances}] [limit=${MAX_ACCOUNTS_PER_SCAN}]`
      );
    }

    return {
      accounts: discovered,
      machineErrors: results.flatMap((r) => (r.error ? [r.error] : [])),
      dependencies: [],
      scannedDependencyMachines: [],
      scannedAccountMachines
    };
  };

  return { validateConnection, scan };
};
