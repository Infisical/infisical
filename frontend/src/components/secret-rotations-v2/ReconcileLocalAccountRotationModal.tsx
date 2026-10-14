import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { SecretRotation, TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { useReconcileLocalAccountRotation } from "@app/hooks/api/secretRotationsV2/mutations";

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
  )
    return null;

  const { id: rotationId, projectId, folder, type } = secretRotation;
  const rotationTypeName = getRotationTypeName(type);

  const handleReconcile = async () => {
    const result = await reconcileLocalAccount.mutateAsync({
      rotationId,
      type,
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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent isPending={reconcileLocalAccount.isPending}>
        <DialogHeader>
          <DialogTitle>Reconcile {rotationTypeName}</DialogTitle>
          <DialogDescription>
            Sync the {rotationTypeName} password between Infisical and the server.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm text-foreground-secondary">
          <p>
            Reconciliation ensures the password stored in Infisical matches the actual password on
            the server.
          </p>
          <p>
            Use this if you suspect the credentials are out of sync, for example after a failed
            rotation or manual password change on the server.
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="project"
            onClick={() => handleReconcile().catch(() => undefined)}
            isPending={reconcileLocalAccount.isPending}
          >
            Reconcile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
