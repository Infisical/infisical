import { PamAccessGrantStatus, PamAccessRequestStatus } from "@app/hooks/api/pam";
import { TPamAccessRequest } from "@app/hooks/api/pam/types";

type StatusInfo = { variant: "warning" | "success" | "danger" | "neutral"; label: string };

const STATUS_BADGE: Record<string, StatusInfo> = {
  [PamAccessRequestStatus.Pending]: { variant: "warning", label: "Pending Review" },
  [PamAccessRequestStatus.Approved]: { variant: "success", label: "Approved" },
  [PamAccessRequestStatus.Rejected]: { variant: "danger", label: "Rejected" },
  [PamAccessRequestStatus.Expired]: { variant: "neutral", label: "Expired" },
  [PamAccessGrantStatus.Revoked]: { variant: "danger", label: "Revoked" }
};

// The underlying request status stays "approved" after approval; the grant carries the real
// post-approval state. A revoked grant shows "Revoked", and a grant past its expiry shows "Expired".
export const getRequestStatusInfo = (
  request: Pick<TPamAccessRequest, "status" | "grantExpiresAt" | "grantStatus">
): StatusInfo => {
  if (request.status === PamAccessRequestStatus.Approved) {
    if (request.grantStatus === PamAccessGrantStatus.Revoked)
      return STATUS_BADGE[PamAccessGrantStatus.Revoked];
    const grantExpired =
      !!request.grantExpiresAt && new Date(request.grantExpiresAt).getTime() <= Date.now();
    if (grantExpired) return STATUS_BADGE[PamAccessRequestStatus.Expired];
  }

  return STATUS_BADGE[request.status] ?? STATUS_BADGE[PamAccessRequestStatus.Pending];
};

// A grant is revocable while the request is approved and the grant is neither revoked nor expired.
export const isGrantActive = (
  request: Pick<TPamAccessRequest, "status" | "grantExpiresAt" | "grantStatus"> | null
): boolean =>
  request?.status === PamAccessRequestStatus.Approved &&
  request.grantStatus !== PamAccessGrantStatus.Revoked &&
  !(request.grantExpiresAt && new Date(request.grantExpiresAt).getTime() <= Date.now());
