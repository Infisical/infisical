import RE2 from "re2";

import { CodeSigningScopeField } from "./code-signing-policy-enums";
import { TCodeSigningScope } from "./code-signing-policy-types";

const REDACTED_VALUE = "***";

const SECRET_ARGUMENT_NAMES = "storepass|keypass|passphrase|password|passwd|passin|passout|pass|pin|pw|p";
const SECRET_NAME_SUFFIXES = "password|passphrase|passwd";

const INLINE_SECRET_RE = new RE2(
  `((?:^|\\s)[-/]{0,2}[A-Za-z0-9._:-]*(?:${SECRET_NAME_SUFFIXES})\\s*=\\s*)("[^"]*"|\\S+)`,
  "gi"
);
const INLINE_NAMED_SECRET_RE = new RE2(`((?:^|\\s)[-/]{1,2}(?:${SECRET_ARGUMENT_NAMES})\\s*=\\s*)("[^"]*"|\\S+)`, "gi");
const SEPARATED_SECRET_RE = new RE2(
  `((?:^|\\s)[-/]{1,2}(?:${SECRET_ARGUMENT_NAMES}|[A-Za-z0-9._:-]*(?:${SECRET_NAME_SUFFIXES}))[ \\t]+)("[^"]*"|[^-/\\s]\\S*)`,
  "gi"
);
const COLON_SECRET_RE = new RE2(`((?:^|\\s)[-/]{1,2}(?:${SECRET_ARGUMENT_NAMES}):)("[^"]*"|[^=\\s]+)(\\s|$)`, "gi");

/**
 * Strips credential values out of a command line.
 */
export const redactCommandCredentials = (command: string): string => {
  const withoutInlineSecrets = [INLINE_SECRET_RE, INLINE_NAMED_SECRET_RE, SEPARATED_SECRET_RE].reduce(
    (redacted, pattern) => redacted.replace(pattern, `$1${REDACTED_VALUE}`),
    command
  );
  return withoutInlineSecrets.replace(COLON_SECRET_RE, `$1${REDACTED_VALUE}$3`);
};

export const normalizeCodeSigningScope = (scope: TCodeSigningScope | undefined): TCodeSigningScope | undefined => {
  if (!scope) return undefined;

  const declared: TCodeSigningScope = {};
  let hasAny = false;
  for (const field of Object.values(CodeSigningScopeField)) {
    const value = scope[field]?.trim();
    if (value) {
      declared[field] = field === CodeSigningScopeField.Command ? redactCommandCredentials(value) : value;
      hasAny = true;
    }
  }

  return hasAny ? declared : undefined;
};

export type TObservedSigningContext = {
  [CodeSigningScopeField.Command]?: string;
  [CodeSigningScopeField.SigningApplication]?: string;
  [CodeSigningScopeField.SigningApplicationHash]?: string;
  [CodeSigningScopeField.Hostname]?: string;
  [CodeSigningScopeField.OsUsername]?: string;
  [CodeSigningScopeField.IpAddress]?: string;
  [CodeSigningScopeField.DataHash]?: string;
};

export const buildObservedSigningContext = ({
  clientMetadata,
  ipAddress,
  dataHash
}: {
  clientMetadata?: {
    command?: string;
    tool?: string;
    signingApplicationHash?: string;
    hostname?: string;
    osUsername?: string;
  };
  ipAddress?: string;
  dataHash: string;
}): TObservedSigningContext => ({
  [CodeSigningScopeField.Command]: clientMetadata?.command
    ? redactCommandCredentials(clientMetadata.command)
    : clientMetadata?.command,
  [CodeSigningScopeField.SigningApplication]: clientMetadata?.tool,
  [CodeSigningScopeField.SigningApplicationHash]: clientMetadata?.signingApplicationHash,
  [CodeSigningScopeField.Hostname]: clientMetadata?.hostname,
  [CodeSigningScopeField.OsUsername]: clientMetadata?.osUsername,
  [CodeSigningScopeField.IpAddress]: ipAddress,
  [CodeSigningScopeField.DataHash]: dataHash
});

const WHITESPACE_RE = new RE2("\\s+", "g");

/**
 * Whether two signing commands are the same command.
 *
 * The comparison is exact apart from whitespace, which is collapsed on both sides so that a run of
 * spaces or a tab where the other side has one space still matches. Anything else about the command
 * differing, including the order of its options, makes it a different command and needs its own
 * approval.
 */
export const commandsMatch = (bound: string, observed: string): boolean =>
  bound.trim().replace(WHITESPACE_RE, " ") === observed.trim().replace(WHITESPACE_RE, " ");

const CASE_INSENSITIVE_FIELDS: readonly CodeSigningScopeField[] = [
  CodeSigningScopeField.Hostname,
  CodeSigningScopeField.DataHash,
  CodeSigningScopeField.SigningApplicationHash,
  // IPv6 is hex, so the same address can be written in either case.
  CodeSigningScopeField.IpAddress
];

export const getCodeSigningScopeMismatches = (
  bound: TCodeSigningScope | null | undefined,
  observed: TObservedSigningContext
): CodeSigningScopeField[] => {
  if (!bound) return [];

  return Object.values(CodeSigningScopeField).filter((field) => {
    const boundValue = bound[field]?.trim();
    if (!boundValue) return false;
    const observedValue = observed[field]?.trim();
    if (!observedValue) return true;
    if (field === CodeSigningScopeField.Command) {
      return !commandsMatch(boundValue, observedValue);
    }
    if (CASE_INSENSITIVE_FIELDS.includes(field)) {
      return boundValue.toLowerCase() !== observedValue.toLowerCase();
    }
    return boundValue !== observedValue;
  });
};
