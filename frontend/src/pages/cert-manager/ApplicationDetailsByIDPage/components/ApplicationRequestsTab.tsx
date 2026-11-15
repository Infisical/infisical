import { useNavigate, useParams } from "@tanstack/react-router";

import { CertificateRequestsSection } from "../../CertificateRequestsPage/components/CertificateRequestsSection";

type Props = {
  applicationId: string;
  applicationName: string;
};

export const ApplicationRequestsTab = ({ applicationId, applicationName }: Props) => {
  const { orgId } = useParams({ strict: false }) as { orgId?: string };
  const navigate = useNavigate();

  const handleViewCertificateFromRequest = (certificateId: string) => {
    navigate({
      to: "/organizations/$orgId/cert-manager/certificates/$certificateId",
      params: { orgId: orgId ?? "", certificateId },
      search: { fromApplication: applicationName }
    });
  };

  return (
    <CertificateRequestsSection
      applicationId={applicationId}
      applicationName={applicationName}
      onViewCertificateFromRequest={handleViewCertificateFromRequest}
    />
  );
};
