import ms from "ms";
import picomatch from "picomatch";

import { TAccessApprovalPolicy, TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";
import { ApprovalStatus } from "@app/hooks/api/types";
import { isGlobSubsetOfGlob, literalPrefix } from "@app/lib/fn/glob";

export type AccessRequestState =
  | "pending"
  | "approved"
  | "rejected"
  | "revoked"
  | "expired"
  | "policy-deleted";

export const getAccessRequestState = (
  request: TAccessApprovalRequest,
  now = new Date()
): AccessRequestState => {
  if (request.status === ApprovalStatus.REVOKED) return "revoked";

  if (request.isApproved || request.status === ApprovalStatus.APPROVED) return "approved";

  if (
    request.status === ApprovalStatus.REJECTED ||
    request.reviewers.some((reviewer) => reviewer.status === ApprovalStatus.REJECTED)
  ) {
    return "rejected";
  }

  if (request.policy.deletedAt) return "policy-deleted";

  if (request.expiresAt && new Date(request.expiresAt) < now) return "expired";

  return "pending";
};

// Parse a user-supplied duration string ("30m", "2h", "1d") to milliseconds.
// Returns undefined for anything ms() can't parse to a positive number.
export const parseAccessDurationMs = (value?: string | null) => {
  if (!value) return undefined;
  try {
    const parsed = ms(value);
    return typeof parsed === "number" && parsed > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const DURATION_UNITS = [
  { label: "day", ms: 24 * 60 * 60 * 1000 },
  { label: "hour", ms: 60 * 60 * 1000 },
  { label: "minute", ms: 60 * 1000 },
  { label: "second", ms: 1000 }
] as const;

// Break a duration into its exact day/hour/minute/second parts instead of letting
// ms() round to a single unit (e.g. 90m -> "1 hour 30 minutes", not "2 hours").
export const formatAccessDuration = (durationMs: number) => {
  const parts: string[] = [];
  let remaining = durationMs;

  DURATION_UNITS.forEach(({ label, ms: unitMs }) => {
    const count = Math.floor(remaining / unitMs);
    if (count > 0) {
      parts.push(`${count} ${label}${count === 1 ? "" : "s"}`);
      remaining -= count * unitMs;
    }
  });

  return parts.length ? parts.join(" ") : "0 seconds";
};

// Single source for the access-duration copy so the label a requester previews in
// RequestAccessForm matches what reviewers later see in ReviewAccessModal.
export const getAccessDurationLabel = (isTemporary?: boolean, temporaryRange?: string | null) => {
  if (!isTemporary || !temporaryRange) return "Permanent";
  const rangeMs = parseAccessDurationMs(temporaryRange);
  if (!rangeMs) return `Valid for ${temporaryRange} after approval`;
  return `Valid for ${formatAccessDuration(rangeMs)} after approval`;
};

export const ENTIRE_SCOPE_PATH = "/**";

export const isGlobPath = (secretPath: string) => picomatch.scan(secretPath).isGlob;

// The server refuses a request whose rules name different paths, so the first rule's path is the request's.
export const getRequestedSecretPath = (
  request: Pick<TAccessApprovalRequest, "permissions" | "policy">
) => {
  const glob = request.permissions?.[0]?.conditions?.secretPath?.$glob;
  return typeof glob === "string" ? glob : (request.policy.secretPath ?? "/");
};

// Mirrors resolveSecretAccessPolicyForPath on the server, so the form applies the limits of the policy that
// will own the request.
export const resolveAccessPolicyForPath = (policies: TAccessApprovalPolicy[], secretPath: string) =>
  policies
    .filter((policy) => isGlobSubsetOfGlob(policy.secretPath, secretPath))
    .sort(
      (a, b) =>
        Number(b.secretPath === secretPath) - Number(a.secretPath === secretPath) ||
        literalPrefix(b.secretPath).length - literalPrefix(a.secretPath).length ||
        Number(isGlobSubsetOfGlob(a.secretPath, b.secretPath)) -
          Number(isGlobSubsetOfGlob(b.secretPath, a.secretPath)) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a.id.localeCompare(b.id)
    )
    .shift();
