import { getCertificateLabel } from "@app/components/utilities/certificateDisplayUtils";
import { truncateSerialNumber } from "@app/components/utilities/serialNumberUtils";
import {
  APPLICATION_POLICY_TYPE_LABELS,
  isCertificateActionPolicyType
} from "@app/hooks/api/approvalPolicies";
import {
  CertRequestRequestData,
  isCertRenewalRequest,
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
      profileName: data.profileName,
      serialNumber: data.serialNumber,
      renewedCertificateName: ""
    };
  }

  const data = isCertRequestData(request.requestData) ? request.requestData.requestData : null;
  const renewal = data && "renewal" in data ? data.renewal : undefined;
  const commonName = data?.certificateRequest?.commonName ?? "";
  return {
    typeLabel: data && isCertRenewalRequest(data) ? "Renewal" : "Issuance",
    commonName,
    displayName: commonName,
    profileName: data?.profileName ?? "",
    serialNumber: "",
    renewedCertificateName: renewal?.certificateName ?? ""
  };
};

// The certificate page shows serials in uppercase and some tools print them colon-separated, so neither the case nor
// the colons should stop a pasted serial from matching.
const normalizeSerial = (value: string) => value.replace(/:/g, "").toLowerCase();

export const matchesApplicationRequestSearch = (request: TApprovalRequest, search: string) => {
  const norm = search.trim().toLowerCase();
  if (!norm) return true;
  const { typeLabel, commonName, profileName, serialNumber, renewedCertificateName } =
    getApplicationRequestSummary(request);
  const requester = `${request.requesterName} ${request.requesterEmail}`;
  const serialQuery = normalizeSerial(norm);
  return (
    (serialQuery.length > 0 && normalizeSerial(serialNumber).includes(serialQuery)) ||
    commonName.toLowerCase().includes(norm) ||
    renewedCertificateName.toLowerCase().includes(norm) ||
    profileName.toLowerCase().includes(norm) ||
    typeLabel.toLowerCase().includes(norm) ||
    requester.toLowerCase().includes(norm)
  );
};
