import { useNavigate, useParams } from "@tanstack/react-router";

import { CertificateRequestsSection } from "../../CertificateRequestsPage/components/CertificateRequestsSection";
import { ApplicationTab } from "../application-tabs";

type Props = {
  applicationId: string;
  applicationName: string;
};

export const ApplicationRequestsTab = ({ applicationId, applicationName }: Props) => {
  const { orgId } = useParams({ strict: false }) as { orgId?: string };
  const navigate = useNavigate();

  const handleViewCertificateFromRequest = (certificateId: string) => {
    navigate({
      to: "/organizations/$orgId/cert-manager/applications/$applicationName",
      params: {
        orgId: orgId ?? "",
        applicationName
      },
      search: { selectedTab: ApplicationTab.Certificates, search: certificateId }
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
