import { getCertificateLabel } from "@app/components/utilities/certificateDisplayUtils";
import { truncateSerialNumber } from "@app/components/utilities/serialNumberUtils";
import {
  APPLICATION_POLICY_TYPE_LABELS,
  isCertificateActionPolicyType
} from "@app/hooks/api/approvalPolicies";
import {
  CertRequestRequestData,
  TApprovalRequest,
  TCertificateActionRequestData
} from "@app/hooks/api/approvalRequests";

const isCertRequestData = (data: unknown): data is { requestData: CertRequestRequestData } => {
  return Boolean(
    data &&
    typeof data === "object" &&
    "requestData" in data &&
    data.requestData &&
    typeof data.requestData === "object" &&
    "profileName" in (data.requestData as object)
  );
};

export const getApplicationRequestSummary = (request: TApprovalRequest) => {
  if (isCertificateActionPolicyType(request.type)) {
    const data = request.requestData.requestData as TCertificateActionRequestData;
    return {
      typeLabel: APPLICATION_POLICY_TYPE_LABELS[request.type],
      commonName: getCertificateLabel(data, data.serialNumber),
      displayName: getCertificateLabel(data, truncateSerialNumber(data.serialNumber)),
      profileName: data.profileName
    };
  }

  const data = isCertRequestData(request.requestData) ? request.requestData.requestData : null;
  const commonName = data?.certificateRequest?.commonName ?? "";
  return {
    typeLabel: data && "renewal" in data && data.renewal ? "Renewal" : "Issuance",
    commonName,
    displayName: commonName,
    profileName: data?.profileName ?? ""
  };
};

export const matchesApplicationRequestSearch = (request: TApprovalRequest, search: string) => {
  const norm = search.trim().toLowerCase();
  if (!norm) return true;
  const { typeLabel, commonName, profileName } = getApplicationRequestSummary(request);
  const requester = `${request.requesterName} ${request.requesterEmail}`;
  return (
    commonName.toLowerCase().includes(norm) ||
    profileName.toLowerCase().includes(norm) ||
    typeLabel.toLowerCase().includes(norm) ||
    requester.toLowerCase().includes(norm)
  );
};
