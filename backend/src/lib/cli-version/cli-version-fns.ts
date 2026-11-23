import RE2 from "re2";

// Duplicates UserAgentType.CLI to keep this module out of the audit-log type graph; a test guards the drift.
export const CLI_USER_AGENT_NAME = "cli";

// A source build reports no release number and satisfies every capability.
const DEVELOPMENT_VERSION = "devel";

const VERSION_REGEX = new RE2(/^(\d+)\.(\d+)\.(\d+)/);
const STRICT_VERSION_REGEX = new RE2(/^(\d+)\.(\d+)\.(\d+)$/);
// Only the suffixes the CLI's own builds report: goreleaser snapshots add -devel, or -SNAPSHOT-<commit>
// where a config sets no snapshot template. A free-form suffix would let anyone holding a gateway's
// credential put words on its detail page.
const REPORTED_VERSION_REGEX = new RE2(/^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-devel|-SNAPSHOT-[0-9a-f]{7,40})?$/);

export enum CliCapability {
  DirectGatewayTransport = "direct-gateway-transport",
  AwsIamGateway = "aws-iam-gateway"
}

export const CLI_CAPABILITY_MIN_VERSION: Record<CliCapability, string> = {
  [CliCapability.DirectGatewayTransport]: "0.43.131",
  [CliCapability.AwsIamGateway]: "0.45.14"
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

/**
 * `fromCli` is true when the caller is certainly the Infisical CLI: an accepted version, or the bare
 * token that releases before 0.43.131 send, which is how a gateway too old to report is told apart
 * from one we know nothing about.
 */
export const getReportedCliVersion = (userAgent?: string): { cliVersion: string | null; fromCli: boolean } => {
  if (userAgent === CLI_USER_AGENT_NAME) return { cliVersion: null, fromCli: true };

  const segment = getCliVersionSegment(userAgent);
  if (segment && (segment === DEVELOPMENT_VERSION || REPORTED_VERSION_REGEX.test(segment))) {
    return { cliVersion: segment, fromCli: true };
  }
  return { cliVersion: null, fromCli: false };
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
