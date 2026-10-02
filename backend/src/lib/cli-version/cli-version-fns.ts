import RE2 from "re2";

// Duplicates UserAgentType.CLI to keep this module out of the audit-log type graph; a test guards the drift.
export const CLI_USER_AGENT_NAME = "cli";

// A source build reports no release number and satisfies every capability.
const DEVELOPMENT_VERSION = "devel";

const VERSION_REGEX = new RE2(/^(\d+)\.(\d+)\.(\d+)/);
const STRICT_VERSION_REGEX = new RE2(/^(\d+)\.(\d+)\.(\d+)$/);

export enum CliCapability {
  DirectGatewayTransport = "direct-gateway-transport"
}

export const CLI_CAPABILITY_MIN_VERSION: Record<CliCapability, string> = {
  [CliCapability.DirectGatewayTransport]: "0.43.131"
};

const getCliVersionSegment = (userAgent?: string) => {
  if (!userAgent) return null;
  const prefix = `${CLI_USER_AGENT_NAME}/`;
  return userAgent.startsWith(prefix) ? userAgent.slice(prefix.length) : null;
};

export const isCliUserAgent = (userAgent?: string) =>
  userAgent === CLI_USER_AGENT_NAME || getCliVersionSegment(userAgent) !== null;

export const isDevelopmentCli = (userAgent?: string) => getCliVersionSegment(userAgent) === DEVELOPMENT_VERSION;

export const parseCliVersion = (userAgent?: string): [number, number, number] | null => {
  const segment = getCliVersionSegment(userAgent);
  if (!segment) return null;

  const match = VERSION_REGEX.exec(segment);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

const parseMinimum = (minimum: string): [number, number, number] => {
  const match = STRICT_VERSION_REGEX.exec(minimum);
  // Every minimum is a literal we control, so a malformed one is a bug rather than bad input.
  if (!match) throw new Error(`Invalid CLI version '${minimum}': expected the major.minor.patch format`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

export const isCliAtLeastVersion = (userAgent: string | undefined, minimum: string) => {
  const floor = parseMinimum(minimum);
  if (isDevelopmentCli(userAgent)) return true;

  const version = parseCliVersion(userAgent);
  if (!version) return false;

  for (let i = 0; i < floor.length; i += 1) {
    if (version[i] !== floor[i]) return version[i] > floor[i];
  }
  return true;
};

export const cliSupports = (userAgent: string | undefined, capability: CliCapability) =>
  isCliAtLeastVersion(userAgent, CLI_CAPABILITY_MIN_VERSION[capability]);
