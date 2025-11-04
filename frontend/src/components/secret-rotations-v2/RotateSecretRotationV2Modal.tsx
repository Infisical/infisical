import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { useRotateSecretRotationV2 } from "@app/hooks/api/secretRotationsV2/mutations";

type Props = {
  secretRotation?: TSecretRotationV2;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  secretRotation: TSecretRotationV2;
  onComplete: () => void;
};

const Content = ({ secretRotation, onComplete }: ContentProps) => {
  const rotateSecrets = useRotateSecretRotationV2();

  const { id: rotationId, type, projectId, folder } = secretRotation;
  const rotationType = SECRET_ROTATION_MAP[type].name;

  const handleRotateSecrets = async () => {
    await rotateSecrets.mutateAsync({
      rotationId,
      type,
      projectId,
      secretPath: folder.path
    });

    createNotification({
      text: `Successfully rotated ${rotationType} secrets`,
      type: "success"
    });

    onComplete();
  };

  return (
    <div>
      <p className="mb-8 text-sm text-mineshaft-200">
        Are you sure you want to rotate the secrets for this {rotationType} Rotation?
      </p>
      <div className="mt-8 flex w-full items-center justify-between gap-2">
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
        <Button
          onClick={handleRotateSecrets}
          isDisabled={rotateSecrets.isPending}
          isLoading={rotateSecrets.isPending}
          colorSchema="secondary"
        >
          Rotate Secrets
        </Button>
      </div>
    </div>
  );
};

export const RotateSecretRotationV2Modal = ({ isOpen, onOpenChange, secretRotation }: Props) => {
  if (!secretRotation) return null;

  const rotationType = SECRET_ROTATION_MAP[secretRotation.type].name;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Rotate Secrets"
        subTitle={`Rotate the secrets for this ${rotationType}.`}
      >
        <Content secretRotation={secretRotation} onComplete={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
  );
};
