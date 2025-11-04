import { Modal, ModalContent } from "@app/components/v2";
import { TCertificateProfileWithDetails } from "@app/hooks/api/certificateProfiles";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  profile: TCertificateProfileWithDetails;
};

export const RevealAcmeEabSecretModal = ({ isOpen, onClose, profile }: Props) => {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <ModalContent title="Reveal ACME EAB Secret">
        <div>Reveal ACME EAB Secret</div>
      </ModalContent>
    </Modal>
  );
};
