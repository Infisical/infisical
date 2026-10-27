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
import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { useRotateSecretRotationV2 } from "@app/hooks/api/secretRotationsV2/mutations";

type Props = {
  secretRotation?: TSecretRotationV2;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const RotateSecretRotationV2Modal = ({ isOpen, onOpenChange, secretRotation }: Props) => {
  const rotateSecrets = useRotateSecretRotationV2();

  if (!secretRotation) return null;

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

    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent isPending={rotateSecrets.isPending}>
        <DialogHeader>
          <DialogTitle>Rotate Secrets</DialogTitle>
          <DialogDescription>Rotate the secrets for this {rotationType}.</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-foreground-secondary">
          Are you sure you want to rotate the secrets for this {rotationType} Rotation?
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="project"
            onClick={() => handleRotateSecrets().catch(() => undefined)}
            isPending={rotateSecrets.isPending}
          >
            Rotate Secrets
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
