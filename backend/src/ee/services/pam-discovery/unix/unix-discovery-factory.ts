import slugify from "@sindresorhus/slugify";
import pLimit from "p-limit";
import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";
import { SshExecCredentials } from "@app/lib/gateway-v2/ssh-rpc";
import { logger } from "@app/lib/logger";

import { PamAccountType, PamSshAuthMethod } from "../../pam/pam-enums";
import { sshExecWithGateway, sweepReachableTargets } from "../pam-discovery-fns";
import {
  TDiscoveredAccount,
  TDiscoveryCredentialAccount,
  TDiscoveryMachineError,
  TDiscoveryScanResult,
  TPamDiscoveryFactory
} from "../pam-discovery-types";
import { expandTargets } from "./unix-discovery-fns";

const SSH_EXEC_TIMEOUT_MS = 20 * 1000;
const SCAN_CONCURRENCY = 64;
const SWEEP_DIAL_TIMEOUT_MS = 3 * 1000;
const MAX_SWEEP_TARGETS = 65536;
const MAX_ACCOUNTS_PER_HOST = 2000;
const MAX_ACCOUNTS_PER_SCAN = 50000;
const MAX_USERNAME_LENGTH = 64;
const PASSWD_MARKER = "__INFISICAL_PASSWD__";
const DEFAULT_UID_MIN = 1000;
const DEFAULT_UID_MAX = 60000;

// one round-trip that returns the login.defs uid bounds followed by the passwd database
const ENUMERATION_COMMAND = `grep -E '^UID_(MIN|MAX)' /etc/login.defs 2>/dev/null; echo '${PASSWD_MARKER}'; getent passwd 2>/dev/null || cat /etc/passwd 2>/dev/null`;

const NOLOGIN_SHELL_REGEX = new RE2(/(nologin|\/false|\/true|\/sync|\/shutdown|\/halt)$/);
const UID_MIN_REGEX = new RE2(/^UID_MIN\s+(\d+)/m);
const UID_MAX_REGEX = new RE2(/^UID_MAX\s+(\d+)/m);
const TRAILING_HYPHENS_REGEX = new RE2(/-+$/);

const SYSTEM_ACCOUNT_NAMES = new Set([
  "daemon",
  "bin",
  "sys",
  "adm",
  "lp",
  "sync",
  "shutdown",
  "halt",
  "mail",
  "news",
  "uucp",
  "operator",
  "games",
  "gopher",
  "ftp",
  "nobody",
  "dbus",
  "sshd",
  "www-data",
  "backup",
  "list",
  "irc",
  "gnats",
  "proxy",
  "man"
]);

type TUnixAccount = { host: string; port: number; credentials: SshExecCredentials };

const toUnixAccount = (account: TDiscoveryCredentialAccount): TUnixAccount => {
  const connectionDetails = account.connectionDetails as { host: string; port: number };
  return {
    host: connectionDetails.host,
    port: connectionDetails.port,
    credentials: account.credentials as unknown as SshExecCredentials
  };
};

// the gateway performs the ssh login, so an account is usable as long as it carries the secret its auth method needs
const isUsableAccount = (account: TUnixAccount) => {
  const { authMethod, password, privateKey, certificate } = account.credentials;
  if (authMethod === PamSshAuthMethod.Password) return Boolean(password);
  if (authMethod === PamSshAuthMethod.PublicKey) return Boolean(privateKey);
  if (authMethod === PamSshAuthMethod.Certificate) return Boolean(privateKey && certificate);
  return false;
};

const isLoginAccount = (name: string, uidStr: string, shell: string, uidMin: number, uidMax: number) => {
  const uid = Number(uidStr);
  if (Number.isNaN(uid) || uid < uidMin || uid > uidMax) return false;
  if (name.startsWith("_") || SYSTEM_ACCOUNT_NAMES.has(name)) return false;
  if (shell && NOLOGIN_SHELL_REGEX.test(shell)) return false;
  return true;
};

const parseUnixUsernames = (output: string, includeSystemAccounts: boolean): string[] => {
  const [defsPart = "", passwdPart = ""] = output.split(PASSWD_MARKER);

  const uidMin = Number(defsPart.match(UID_MIN_REGEX)?.[1]) || DEFAULT_UID_MIN;
  const uidMax = Number(defsPart.match(UID_MAX_REGEX)?.[1]) || DEFAULT_UID_MAX;

  const usernames = new Set<string>();
  for (const line of passwdPart.split("\n")) {
    if (usernames.size >= MAX_ACCOUNTS_PER_HOST) break;
    const [name, , uidStr, , , , shell = ""] = line.trim().split(":");
    if (name && name.length <= MAX_USERNAME_LENGTH) {
      if (name === "root" || includeSystemAccounts || isLoginAccount(name, uidStr, shell, uidMin, uidMax)) {
        usernames.add(name);
      }
    }
  }
  return [...usernames];
};

export const unixDiscoveryFactory: TPamDiscoveryFactory = ({
  gatewayId,
  configuration,
  credentialAccounts,
  gatewayV2Service
}) => {
  const accounts = credentialAccounts.map(toUnixAccount);
  const config = configuration as { cidrRanges: string[]; includeSystemAccounts?: boolean };

  // accounts whose stored host matches the target are tried first, then every other account
  const orderAccountsForHost = (host: string) => [
    ...accounts.filter((a) => a.host === host),
    ...accounts.filter((a) => a.host !== host)
  ];

  const enumerateHost = (host: string, account: TUnixAccount, signal?: AbortSignal) =>
    sshExecWithGateway(
      host,
      account.port,
      gatewayId,
      gatewayV2Service,
      ENUMERATION_COMMAND,
      account.credentials,
      SSH_EXEC_TIMEOUT_MS,
      signal
    );

  const scanHost = async (
    host: string,
    open: Set<string>,
    signal: AbortSignal
  ): Promise<{ accounts: TDiscoveredAccount[]; error?: TDiscoveryMachineError }> => {
    if (signal.aborted) return { accounts: [] };
    const isKnownHost = accounts.some((a) => a.host === host);
    const candidates = orderAccountsForHost(host).filter(
      (account) => isUsableAccount(account) && (isKnownHost || open.has(`${host}:${account.port}`))
    );

    let lastError = "no credential account could authenticate";
    for (const account of candidates) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const output = await enumerateHost(host, account, signal);
        return {
          accounts: parseUnixUsernames(output, config.includeSystemAccounts ?? false).map((username) => ({
            accountType: PamAccountType.SSH,
            name: slugify(`${host} ${username}`, { lowercase: true }).slice(0, 64).replace(TRAILING_HYPHENS_REGEX, ""),
            fingerprint: `${host}:${username}`,
            details: {
              connectionDetails: { host, port: account.port },
              credentials: { authMethod: PamSshAuthMethod.Password, username }
            }
          }))
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : "SSH enumeration failed";
      }
    }

    if (candidates.length) {
      logger.warn(`PAM Unix discovery failed to scan host [host=${host}] [error=${lastError}]`);
      return { accounts: [], error: { machine: host, error: lastError } };
    }
    return { accounts: [] };
  };

  const validateConnection = async () => {
    const account = accounts.find(isUsableAccount);
    if (!account) {
      throw new BadRequestError({
        message: "No credential account has usable authentication (password, private key, or certificate)"
      });
    }
    await enumerateHost(account.host, account).catch((err) => {
      throw new BadRequestError({
        message: `Unable to connect over SSH: ${err instanceof Error ? err.message : "unknown error"}`
      });
    });
  };

  const scan = async (signal: AbortSignal): Promise<TDiscoveryScanResult> => {
    if (!accounts.some(isUsableAccount)) {
      throw new BadRequestError({
        message: "No credential account has usable authentication (password, private key, or certificate)"
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
          "No hosts were reachable on the credential ports in the target range. Check the targets, that the gateway can reach them, and that SSH is listening."
      });
    }

    const limit = pLimit(SCAN_CONCURRENCY);
    const results = await Promise.all(hostsToScan.map((host) => limit(() => scanHost(host, open, signal))));

    const discovered = results.flatMap((r) => r.accounts);
    if (discovered.length > MAX_ACCOUNTS_PER_SCAN) {
      logger.warn(
        `PAM Unix discovery truncating discovered accounts to the per-scan limit [found=${discovered.length}] [limit=${MAX_ACCOUNTS_PER_SCAN}]`
      );
    }

    return {
      accounts: discovered.slice(0, MAX_ACCOUNTS_PER_SCAN),
      machineErrors: results.flatMap((r) => (r.error ? [r.error] : []))
    };
  };

  return { validateConnection, scan };
};
