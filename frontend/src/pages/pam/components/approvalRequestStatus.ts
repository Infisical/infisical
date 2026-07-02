import { TPamAccessRequest } from "@app/hooks/api/pam/types";

type StatusInfo = { variant: "warning" | "success" | "danger" | "neutral"; label: string };

const STATUS_BADGE: Record<string, StatusInfo> = {
  pending: { variant: "warning", label: "Pending Review" },
  approved: { variant: "success", label: "Approved" },
  rejected: { variant: "danger", label: "Rejected" },
  expired: { variant: "neutral", label: "Expired" },
  revoked: { variant: "danger", label: "Revoked" }
};

// The underlying request status stays "approved" after approval; the grant carries the real
// post-approval state. A revoked grant shows "Revoked", and a grant past its expiry shows "Expired".
export const getRequestStatusInfo = (
  request: Pick<TPamAccessRequest, "status" | "grantExpiresAt" | "grantStatus">
): StatusInfo => {
  if (request.status === "approved") {
    if (request.grantStatus === "revoked") return STATUS_BADGE.revoked;
    const grantExpired = !!request.grantExpiresAt && new Date(request.grantExpiresAt).getTime() <= Date.now();
    if (grantExpired) return STATUS_BADGE.expired;
  }

  return STATUS_BADGE[request.status] ?? STATUS_BADGE.pending;
};
