import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { SecretRotation, TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { useReconcileLocalAccountRotation } from "@app/hooks/api/secretRotationsV2/mutations";
import { TUnixLinuxLocalAccountRotation } from "@app/hooks/api/secretRotationsV2/types/unix-linux-local-account-rotation";
import { TWindowsLocalAccountRotation } from "@app/hooks/api/secretRotationsV2/types/windows-local-account-rotation";

type Props = {
  secretRotation?: TSecretRotationV2;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  secretRotation: TUnixLinuxLocalAccountRotation | TWindowsLocalAccountRotation;
  onComplete: () => void;
};

const getRotationTypeName = (type: SecretRotation): string => {
  return type === SecretRotation.UnixLinuxLocalAccount
    ? "Unix/Linux Local Account"
    : "Windows Local Account";
};

const Content = ({ secretRotation, onComplete }: ContentProps) => {
  const reconcileLocalAccount = useReconcileLocalAccountRotation();

  const { id: rotationId, projectId, folder, type } = secretRotation;
  const rotationTypeName = getRotationTypeName(type);

  const handleReconcile = async () => {
    const result = await reconcileLocalAccount.mutateAsync({
      rotationId,
      type: type as SecretRotation.UnixLinuxLocalAccount | SecretRotation.WindowsLocalAccount,
      projectId,
      secretPath: folder.path
    });

    createNotification({
      text: result.reconciled
        ? `Successfully reconciled ${rotationTypeName} rotation`
        : `${rotationTypeName} rotation is already in sync`,
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
          isDisabled={reconcileLocalAccount.isPending}
          isLoading={reconcileLocalAccount.isPending}
          colorSchema="secondary"
        >
          Reconcile
        </Button>
      </div>
    </div>
  );
};

export const ReconcileLocalAccountRotationModal = ({
  isOpen,
  onOpenChange,
  secretRotation
}: Props) => {
  if (
    !secretRotation ||
    (secretRotation.type !== SecretRotation.UnixLinuxLocalAccount &&
      secretRotation.type !== SecretRotation.WindowsLocalAccount)
  )
    return null;

  const rotationTypeName = getRotationTypeName(secretRotation.type);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title={`Reconcile ${rotationTypeName}`}
        subTitle={`Sync the ${rotationTypeName} password between Infisical and the server.`}
      >
        <Content
          secretRotation={
            secretRotation as TUnixLinuxLocalAccountRotation | TWindowsLocalAccountRotation
          }
          onComplete={() => onOpenChange(false)}
        />
      </ModalContent>
    </Modal>
  );
};
