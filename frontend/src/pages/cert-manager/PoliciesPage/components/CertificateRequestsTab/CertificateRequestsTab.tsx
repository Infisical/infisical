import { CertificateRequestsSection } from "@app/pages/cert-manager/CertificateRequestsPage/components";

type Props = {
  onViewCertificateFromRequest?: (certificateId: string) => void;
};

export const CertificateRequestsTab = ({ onViewCertificateFromRequest }: Props) => {
  return <CertificateRequestsSection onViewCertificateFromRequest={onViewCertificateFromRequest} />;
};
