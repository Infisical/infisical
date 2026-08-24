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

const ENUMERATION_QUERY = `SELECT rolname FROM pg_roles WHERE rolcanlogin ORDER BY rolname LIMIT ${MAX_ACCOUNTS_PER_HOST}`;

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

  const orderAccountsForHost = (host: string) => [
    ...accounts.filter((a) => a.host === host),
    ...accounts.filter((a) => a.host !== host)
  ];

  const enumerateHost = (host: string, account: TPostgresAccount) =>
    executeWithGateway(host, account.port, gatewayId, gatewayV2Service, async (proxyPort) => {
      const db = knex({
        client: "pg",
        connection: {
          host: "localhost",
          port: proxyPort,
          database: account.database,
          user: account.username,
          password: account.password,
          connectionTimeoutMillis: QUERY_TIMEOUT_MS,
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

  const scanHost = async (
    host: string,
    open: Set<string>,
    signal: AbortSignal
  ): Promise<{ accounts: TDiscoveredAccount[]; error?: TDiscoveryMachineError; scannedMachine?: string }> => {
    if (signal.aborted) return { accounts: [] };
    const isKnownHost = accounts.some((a) => a.host === host);
    const candidates = orderAccountsForHost(host).filter(
      (account) => isUsableAccount(account) && (isKnownHost || open.has(`${host}:${account.port}`))
    );

    let lastError = "no credential account could authenticate";
    for (const account of candidates) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const rolnames = await enumerateHost(host, account);
        return {
          scannedMachine: `${host}:${account.port}`,
          accounts: rolnames.map((rolname) => ({
            accountType: PamAccountType.Postgres,
            name: slugify(`${host} ${rolname}`, { lowercase: true }).slice(0, 64).replace(TRAILING_HYPHENS_REGEX, ""),
            fingerprint: `${host}:${account.port}:${rolname}`,
            details: {
              connectionDetails: {
                host,
                port: account.port,
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
        lastError = err instanceof Error ? err.message : "PostgreSQL enumeration failed";
      }
    }

    if (candidates.length) {
      logger.warn(`PAM PostgreSQL discovery failed to scan host [host=${host}] [error=${lastError}]`);
      return { accounts: [], error: { machine: host, error: lastError } };
    }
    return { accounts: [] };
  };

  const validateConnection = async () => {
    const account = accounts.find(isUsableAccount);
    if (!account) {
      throw new BadRequestError({
        message:
          "No credential account has a password. PostgreSQL discovery requires password authentication; AWS IAM accounts cannot be used to scan."
      });
    }
    await enumerateHost(account.host, account).catch((err) => {
      throw new BadRequestError({
        message: `Unable to connect to PostgreSQL: ${err instanceof Error ? err.message : "unknown error"}`
      });
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

    const hostsToScan = targets.filter(
      (host) => accounts.some((a) => a.host === host) || usablePorts.some((port) => open.has(`${host}:${port}`))
    );

    if (!hostsToScan.length) {
      throw new BadRequestError({
        message:
          "No hosts were reachable on the credential ports in the target range. Check the targets, that the gateway can reach them, and that PostgreSQL is listening."
      });
    }

    const limit = pLimit(SCAN_CONCURRENCY);
    const results = await Promise.all(hostsToScan.map((host) => limit(() => scanHost(host, open, signal))));

    const discovered = results.flatMap((r) => r.accounts);
    if (discovered.length > MAX_ACCOUNTS_PER_SCAN) {
      logger.warn(
        `PAM PostgreSQL discovery truncating discovered accounts to the per-scan limit [found=${discovered.length}] [limit=${MAX_ACCOUNTS_PER_SCAN}]`
      );
    }

    return {
      accounts: discovered.slice(0, MAX_ACCOUNTS_PER_SCAN),
      machineErrors: results.flatMap((r) => (r.error ? [r.error] : [])),
      dependencies: [],
      scannedDependencyMachines: [],
      scannedAccountMachines: results.flatMap((r) => (r.scannedMachine ? [r.scannedMachine] : []))
    };
  };

  return { validateConnection, scan };
};
