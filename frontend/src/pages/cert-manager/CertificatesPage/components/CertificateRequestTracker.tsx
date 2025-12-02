import { useEffect } from "react";
import { faCheck, faExclamationTriangle, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useProject } from "@app/context";
import { useGetCertificateRequest } from "@app/hooks/api/certificates";

type CertificateInfo = {
  id: string;
  serialNumber: string;
  commonName: string;
  notAfter: string;
  [key: string]: unknown;
};

type Props = {
  requestId: string;
  onCertificateIssued?: (certificate: CertificateInfo) => void;
};

export const CertificateRequestTracker = ({ requestId, onCertificateIssued }: Props) => {
  const { currentProject } = useProject();

  const { data: requestData, isLoading } = useGetCertificateRequest(
    requestId,
    currentProject?.slug || ""
  );

  useEffect(() => {
    if (requestData?.status === "issued" && requestData.certificate && onCertificateIssued) {
      onCertificateIssued(requestData.certificate);
    }
  }, [requestData, onCertificateIssued]);

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-primary" />
        <span className="text-sm text-mineshaft-400">Loading request status...</span>
      </div>
    );
  }

  const getStatusIcon = () => {
    switch (requestData?.status) {
      case "pending":
        return <FontAwesomeIcon icon={faSpinner} className="animate-spin text-yellow-500" />;
      case "issued":
        return <FontAwesomeIcon icon={faCheck} className="text-green-500" />;
      case "failed":
        return <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusMessage = () => {
    switch (requestData?.status) {
      case "pending":
        return "Certificate request is being processed...";
      case "issued":
        return "Certificate has been issued successfully!";
      case "failed":
        return `Certificate request failed: ${requestData.errorMessage || "Unknown error"}`;
      default:
        return "Unknown status";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        {getStatusIcon()}
        <span className="text-sm font-medium text-mineshaft-300">
          Certificate Request ID: {requestId}
        </span>
      </div>

      <div className="text-sm text-mineshaft-400">
        Status: <span className="font-medium capitalize">{requestData?.status || "Unknown"}</span>
      </div>

      <div className="text-sm text-mineshaft-400">{getStatusMessage()}</div>

      {requestData?.status === "issued" && requestData.certificate && (
        <div className="mt-4 rounded-md border border-green-500/30 bg-green-900/20 p-3">
          <div className="text-sm text-green-400">
            <strong>Certificate Details:</strong>
            <br />
            Serial Number: {requestData.certificate.serialNumber}
            <br />
            Common Name: {requestData.certificate.commonName}
            <br />
            Valid Until: {new Date(requestData.certificate.notAfter).toLocaleDateString()}
          </div>
        </div>
      )}

      {requestData?.status === "failed" && requestData.errorMessage && (
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-900/20 p-3">
          <div className="text-sm text-red-400">
            <strong>Error Details:</strong>
            <br />
            {requestData.errorMessage}
          </div>
        </div>
      )}
    </div>
  );
};
