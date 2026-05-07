import { CertificatesSection } from "../../CertificatesPage/components/CertificatesSection";

type Props = {
  applicationId: string;
  applicationName?: string;
  initialSearch?: string;
};

export const ApplicationCertificatesTab = ({
  applicationId,
  applicationName,
  initialSearch
}: Props) => {
  return (
    <CertificatesSection
      applicationId={applicationId}
      applicationName={applicationName}
      externalFilter={initialSearch ? { search: initialSearch } : undefined}
    />
  );
};
