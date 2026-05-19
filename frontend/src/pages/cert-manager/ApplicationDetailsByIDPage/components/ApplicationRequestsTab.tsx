import { useNavigate, useParams } from "@tanstack/react-router";

import { CertificateRequestsSection } from "../../CertificateRequestsPage/components/CertificateRequestsSection";

type Props = {
  applicationId: string;
  applicationName: string;
};

export const ApplicationRequestsTab = ({ applicationId, applicationName }: Props) => {
  const params = useParams({ strict: false }) as { projectId?: string; orgId?: string };
  const { projectId, orgId } = params;
  const navigate = useNavigate();

  const handleViewCertificateFromRequest = (certificateId: string) => {
    navigate({
      to: "/organizations/$orgId/projects/cert-manager/$projectId/applications/$applicationName",
      params: {
        orgId: orgId ?? "",
        projectId: projectId ?? "",
        applicationName
      },
      search: { selectedTab: "certificates", search: certificateId }
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
