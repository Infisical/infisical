import { RefreshCwIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "@app/components/v3";
import { SecretRotation, TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { useReconcileLocalAccountRotation } from "@app/hooks/api/secretRotationsV2/mutations";
import { THpIloRotation } from "@app/hooks/api/secretRotationsV2/types/hp-ilo-rotation";
import { TUnixLinuxLocalAccountRotation } from "@app/hooks/api/secretRotationsV2/types/unix-linux-local-account-rotation";
import { TWindowsLocalAccountRotation } from "@app/hooks/api/secretRotationsV2/types/windows-local-account-rotation";

type Props = {
  secretRotation?: TSecretRotationV2;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const getRotationTypeName = (type: SecretRotation): string => {
  if (type === SecretRotation.UnixLinuxLocalAccount) return "Unix/Linux Local Account";
  if (type === SecretRotation.WindowsLocalAccount) return "Windows Local Account";
  return "HP iLO Local Account";
};

export const ReconcileLocalAccountRotationModal = ({
  isOpen,
  onOpenChange,
  secretRotation
}: Props) => {
  const reconcileLocalAccount = useReconcileLocalAccountRotation();

  if (
    !secretRotation ||
    (secretRotation.type !== SecretRotation.UnixLinuxLocalAccount &&
      secretRotation.type !== SecretRotation.WindowsLocalAccount &&
      secretRotation.type !== SecretRotation.HpIloLocalAccount)
  ) {
    return null;
  }

  const rotation = secretRotation as
    | TUnixLinuxLocalAccountRotation
    | TWindowsLocalAccountRotation
    | THpIloRotation;
  const { id: rotationId, projectId, folder, type } = rotation;
  const rotationTypeName = getRotationTypeName(type);

  const handleReconcile = async () => {
    const result = await reconcileLocalAccount.mutateAsync({
      rotationId,
      type: type as
        | SecretRotation.UnixLinuxLocalAccount
        | SecretRotation.WindowsLocalAccount
        | SecretRotation.HpIloLocalAccount,
      projectId,
      secretPath: folder.path
    });

    createNotification({
      text: result.reconciled
        ? `Successfully reconciled ${rotationTypeName} rotation`
        : `${rotationTypeName} rotation is already in sync`,
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <RefreshCwIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Reconcile {rotationTypeName}</AlertDialogTitle>
          <AlertDialogDescription>
            Reconciliation ensures the password stored in Infisical matches the actual password on
            the server. Use this if you suspect the credentials are out of sync, for example after a
            failed rotation or manual password change on the server.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleReconcile();
            }}
            isPending={reconcileLocalAccount.isPending}
            isDisabled={reconcileLocalAccount.isPending}
          >
            Reconcile
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
