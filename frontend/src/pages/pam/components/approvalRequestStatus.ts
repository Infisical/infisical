import { TPamAccessRequest } from "@app/hooks/api/pam/types";

type StatusInfo = { variant: "warning" | "success" | "danger" | "neutral"; label: string };

const STATUS_BADGE: Record<string, StatusInfo> = {
  pending: { variant: "warning", label: "Pending Review" },
  approved: { variant: "success", label: "Approved" },
  rejected: { variant: "danger", label: "Rejected" },
  expired: { variant: "neutral", label: "Expired" }
};

// An approved request whose grant has passed its expiry no longer confers access, so it is
// surfaced as "Expired" even though the underlying request status stays "approved".
export const getRequestStatusInfo = (
  request: Pick<TPamAccessRequest, "status" | "grantExpiresAt">
): StatusInfo => {
  const grantExpired =
    request.status === "approved" &&
    !!request.grantExpiresAt &&
    new Date(request.grantExpiresAt).getTime() <= Date.now();

  return STATUS_BADGE[grantExpired ? "expired" : request.status] ?? STATUS_BADGE.pending;
};
