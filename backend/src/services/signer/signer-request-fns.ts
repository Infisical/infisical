import { ApprovalRequestGrantStatus, ApprovalRequestStatus } from "../approval-policy/approval-policy-enums";

type TRevocableGrant = { status: string; expiresAt?: Date | string | null };

// A request that is no longer pending can only be revoked while one of its grants still gives access. Revoking one
// whose access already ended would rewrite its history from expired to revoked.
export const isSignerRequestRevocable = (
  request: { status: string },
  activeGrants: TRevocableGrant[],
  now: Date = new Date()
) => {
  if (request.status === ApprovalRequestStatus.Pending) return true;
  if (request.status !== ApprovalRequestStatus.Approved) return false;

  return activeGrants.some(
    (grant) =>
      grant.status === ApprovalRequestGrantStatus.Active &&
      (!grant.expiresAt || new Date(grant.expiresAt).getTime() > now.getTime())
  );
};
