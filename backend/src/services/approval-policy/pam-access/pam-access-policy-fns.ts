import { TApprovalRequestGrants } from "@app/db/schemas";
import { ms } from "@app/lib/ms";

import { TPamAccessGrantAttributes, TPamAccessPolicyInputs } from "./pam-access-policy-types";

export const PAM_DEFAULT_ACCESS_TYPE = "session";

export const parsePamAccessDuration = (duration: string): number | null => {
  const parsed: number | undefined = ms(duration);
  return !parsed || parsed <= 0 ? null : parsed;
};

export const exceedsPamMaxAccessDuration = (duration: string, maxAccessDurationSeconds: number | null) => {
  const requestedMs = parsePamAccessDuration(duration);
  return maxAccessDurationSeconds !== null && requestedMs !== null && requestedMs > maxAccessDurationSeconds * 1000;
};

// The template max can be lowered while a request is pending, so the grant never outlasts the current max.
export const effectivePamAccessDurationMs = (duration: string, maxAccessDurationSeconds: number | null) => {
  const requestedMs = parsePamAccessDuration(duration);
  if (requestedMs === null || maxAccessDurationSeconds === null) return requestedMs;
  return Math.min(requestedMs, maxAccessDurationSeconds * 1000);
};

export const matchesPamAccessSubject = (payload: unknown, inputs: TPamAccessPolicyInputs) => {
  const attributes = payload as TPamAccessGrantAttributes | null;
  if (attributes?.accountId !== inputs.accountId) return false;
  if ("folderId" in inputs && (attributes?.folderId ?? null) !== (inputs.folderId ?? null)) return false;

  return (attributes?.accessType ?? PAM_DEFAULT_ACCESS_TYPE) === (inputs.accessType ?? PAM_DEFAULT_ACCESS_TYPE);
};

export const matchPamAccessGrants = (grants: TApprovalRequestGrants[], inputs: TPamAccessPolicyInputs) =>
  grants.filter((grant) => matchesPamAccessSubject(grant.attributes, inputs));
