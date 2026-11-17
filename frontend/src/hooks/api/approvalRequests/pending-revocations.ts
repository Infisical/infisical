import {
  ApprovalRequestStatus,
  type CertRevocationRequestData,
  type TApprovalRequest
} from "./types";

export type TPendingRevocation = Pick<TApprovalRequest, "id" | "approversCanNoLongerApprove">;

export type TPendingRevocations = {
  requestByCertificateId: Map<string, TPendingRevocation>;
  nextExpiresAt: number | null;
};

// The server only marks a lapsed request expired when someone acts on it, so a listed request can
// still say pending after its expiresAt.
export const getPendingRevocations = (
  requests: TApprovalRequest[],
  now: number
): TPendingRevocations => {
  const pending = requests.filter(
    (request) =>
      request.status === ApprovalRequestStatus.Pending &&
      (!request.expiresAt || new Date(request.expiresAt).getTime() >= now)
  );
  const expiries = pending.flatMap((request) =>
    request.expiresAt ? [new Date(request.expiresAt).getTime()] : []
  );
  return {
    requestByCertificateId: new Map(
      pending.map((request) => [
        (request.requestData.requestData as CertRevocationRequestData).certificateId,
        { id: request.id, approversCanNoLongerApprove: request.approversCanNoLongerApprove }
      ])
    ),
    nextExpiresAt: expiries.length ? Math.min(...expiries) : null
  };
};
