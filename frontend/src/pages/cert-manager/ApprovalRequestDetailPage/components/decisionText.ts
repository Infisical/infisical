import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import {
  CertRequestRequestData,
  isCertRenewalRequest,
  TApprovalRequest
} from "@app/hooks/api/approvalRequests";

const DECISION_TEXT = {
  revocation: {
    approve:
      "Once every step approves, the certificate is revoked with the requester's reason. This can't be undone.",
    reject: "The request is closed and the certificate isn't revoked. The requester can ask again."
  },
  deletion: {
    approve: "Once every step approves, the certificate is deleted. This can't be undone.",
    reject: "The request is closed and the certificate isn't deleted. The requester can ask again."
  },
  issuance: {
    approve: "Once every step approves, Infisical issues the certificate.",
    reject: "The request is closed and no certificate is issued. The requester can ask again."
  },
  renewal: {
    approve: "Once every step approves, Infisical renews the certificate.",
    reject:
      "The request is closed and the certificate isn't renewed. If the certificate was imported or discovered, Infisical stops renewing it automatically until a manual renewal completes."
  },
  autoRenewal: {
    approve: "Once every step approves, Infisical renews the certificate.",
    reject:
      "The request is closed and the certificate isn't renewed. Infisical stops renewing it automatically until a manual renewal completes."
  },
  access: {
    approve: "The requester gets the access described on this request as soon as you approve.",
    reject: "The request is closed and the requester gets no access. They can open a new one."
  }
};

// A renewal raised before raisedByAutoRenewal existed counts as manual, as it does when the backend rejects it.
export const getDecisionText = (request: TApprovalRequest) => {
  if (request.type === ApprovalPolicyType.CertRevocation) return DECISION_TEXT.revocation;
  if (request.type === ApprovalPolicyType.CertDeletion) return DECISION_TEXT.deletion;
  if (request.type === ApprovalPolicyType.CertRequest) {
    const data = request.requestData.requestData as CertRequestRequestData;
    if (!isCertRenewalRequest(data)) return DECISION_TEXT.issuance;
    return data.renewal?.raisedByAutoRenewal ? DECISION_TEXT.autoRenewal : DECISION_TEXT.renewal;
  }
  return DECISION_TEXT.access;
};
