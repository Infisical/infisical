import { CertificatesSection } from "../../../CertificatesPage/components/CertificatesSection";

type Props = {
  externalFilter?: {
    certificateId?: string;
    search?: string;
  };
};

export const CertificatesTab = ({ externalFilter }: Props) => {
  return <CertificatesSection externalFilter={externalFilter} />;
};
