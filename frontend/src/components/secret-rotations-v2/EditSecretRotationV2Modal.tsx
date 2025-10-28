import { SecretRotationV2ModalHeader } from "@app/components/secret-rotations-v2/SecretRotationV2ModalHeader";
import { Modal, ModalContent } from "@app/components/v2";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationV2Form } from "./forms";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  secretRotation?: TSecretRotationV2;
};

export const EditSecretRotationV2Modal = ({ secretRotation, onOpenChange, ...props }: Props) => {
  if (!secretRotation) return null;

  return (
    <Modal {...props} onOpenChange={onOpenChange}>
      <ModalContent
        title={<SecretRotationV2ModalHeader isConfigured type={secretRotation.type} />}
        className="max-w-2xl"
      >
        <SecretRotationV2Form
          onComplete={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
          secretRotation={secretRotation}
          type={secretRotation.type}
          secretPath={secretRotation.folder.path}
          environment={secretRotation.environment.slug}
        />
      </ModalContent>
    </Modal>
  );
};
