import { Modal, ModalContent } from "@app/components/v2";
import { KmipClientCertificate } from "@app/hooks/api/kmip/types";
import { CertificateContent } from "@app/pages/cert-manager/CertificatesPage/components/CertificateContent";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  certificate: KmipClientCertificate;
};

export const KmipClientCertificateModal = ({ isOpen, onOpenChange, certificate }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="KMIP client certificate">
        <CertificateContent {...certificate} />
      </ModalContent>
    </Modal>
  );
};
