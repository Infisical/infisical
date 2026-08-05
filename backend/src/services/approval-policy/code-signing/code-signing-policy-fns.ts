import RE2 from "re2";

import { CodeSigningScopeField } from "./code-signing-policy-enums";
import { TCodeSigningScope } from "./code-signing-policy-types";

export const normalizeCodeSigningScope = (scope: TCodeSigningScope | undefined): TCodeSigningScope | undefined => {
  if (!scope) return undefined;

  const declared: TCodeSigningScope = {};
  let hasAny = false;
  for (const field of Object.values(CodeSigningScopeField)) {
    const value = scope[field]?.trim();
    if (value) {
      declared[field] = value;
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
  [CodeSigningScopeField.Command]: clientMetadata?.command,
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

type TRequestedSigningWindow = { start?: string; end?: string };

/**
 * Whether two requested signing windows are the same ask, which depends on who is asking.
 *
 * A signing client re-derives its window from a configured duration on every call, so a retry asks
 * for identical terms at a later absolute window. Comparing instants would never match and every
 * retry would open a duplicate request. A person picks absolute times, so both ends of the window
 * are compared: 10:00-18:00 and 12:00-18:00 are different asks even though they end together.
 */
export const isSameRequestedSigningWindow = (
  isHumanRequester: boolean,
  pending: TRequestedSigningWindow,
  incoming: TRequestedSigningWindow
): boolean => {
  const sameEnd = (pending.end ?? null) === (incoming.end ?? null);
  if (isHumanRequester) return sameEnd && (pending.start ?? null) === (incoming.start ?? null);

  if (!pending.start || !pending.end || !incoming.start || !incoming.end) return sameEnd;

  const durationOf = (start: string, end: string) => new Date(end).getTime() - new Date(start).getTime();

  const pendingDuration = durationOf(pending.start, pending.end);
  const incomingDuration = durationOf(incoming.start, incoming.end);
  // A stored window whose timestamps will not parse is a malformed record, not a match.
  if (Number.isNaN(pendingDuration) || Number.isNaN(incomingDuration)) return false;
  return pendingDuration === incomingDuration;
};
