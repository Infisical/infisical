import {
  ApprovalRequestStatus,
  type TApprovalRequest,
  type TCertificateActionRequestData
} from "./types";

export type TPendingCertificateAction = Pick<
  TApprovalRequest,
  "id" | "approversCanNoLongerApprove"
>;

export type TPendingCertificateActions = {
  requestByCertificateId: Map<string, TPendingCertificateAction>;
  nextExpiresAt: number | null;
};

// The server only marks a lapsed request expired when someone acts on it, so a listed request can
// still say pending after its expiresAt.
export const getPendingCertificateActions = (
  requests: TApprovalRequest[],
  now: number
): TPendingCertificateActions => {
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
        (request.requestData.requestData as TCertificateActionRequestData).certificateId,
        { id: request.id, approversCanNoLongerApprove: request.approversCanNoLongerApprove }
      ])
    ),
    nextExpiresAt: expiries.length ? Math.min(...expiries) : null
  };
};
