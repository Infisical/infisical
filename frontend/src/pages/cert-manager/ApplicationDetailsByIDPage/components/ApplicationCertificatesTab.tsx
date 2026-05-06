import { CertificatesSection } from "../../CertificatesPage/components/CertificatesSection";

type Props = {
  applicationId: string;
  initialSearch?: string;
};

export const ApplicationCertificatesTab = ({ applicationId, initialSearch }: Props) => {
  return (
    <CertificatesSection
      applicationId={applicationId}
      externalFilter={initialSearch ? { search: initialSearch } : undefined}
    />
  );
};
