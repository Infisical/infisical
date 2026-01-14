import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { SecretRotation, TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { useReconcileSshPasswordRotation } from "@app/hooks/api/secretRotationsV2/mutations";
import { TSshPasswordRotation } from "@app/hooks/api/secretRotationsV2/types/ssh-password-rotation";

type Props = {
  secretRotation?: TSecretRotationV2;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  secretRotation: TSshPasswordRotation;
  onComplete: () => void;
};

const Content = ({ secretRotation, onComplete }: ContentProps) => {
  const reconcileSshPassword = useReconcileSshPasswordRotation();

  const { id: rotationId, projectId, folder } = secretRotation;

  const handleReconcile = async () => {
    const result = await reconcileSshPassword.mutateAsync({
      rotationId,
      projectId,
      secretPath: folder.path
    });

    createNotification({
      text: result.reconciled
        ? "Successfully reconciled SSH password rotation"
        : "SSH password rotation is already in sync",
      type: "success"
    });

    onComplete();
  };

  return (
    <div>
      <p className="mb-4 text-sm text-mineshaft-200">
        Reconciliation ensures the password stored in Infisical matches the actual password on the
        SSH server.
      </p>
      <p className="mb-8 text-sm text-mineshaft-200">
        Use this if you suspect the credentials are out of sync, for example after a failed rotation
        or manual password change on the server.
      </p>
      <div className="mt-8 flex w-full items-center justify-between gap-2">
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
        <Button
          onClick={handleReconcile}
          isDisabled={reconcileSshPassword.isPending}
          isLoading={reconcileSshPassword.isPending}
          colorSchema="secondary"
        >
          Reconcile
        </Button>
      </div>
    </div>
  );
};

export const ReconcileSshPasswordRotationModal = ({
  isOpen,
  onOpenChange,
  secretRotation
}: Props) => {
  if (!secretRotation || secretRotation.type !== SecretRotation.SshPassword) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Reconcile SSH Password"
        subTitle="Sync the SSH password between Infisical and the server."
      >
        <Content
          secretRotation={secretRotation as TSshPasswordRotation}
          onComplete={() => onOpenChange(false)}
        />
      </ModalContent>
    </Modal>
  );
};
