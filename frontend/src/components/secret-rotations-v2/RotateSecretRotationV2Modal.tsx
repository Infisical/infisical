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
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <RefreshCwIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Rotate Secrets</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to rotate the secrets for this {rotationType} Rotation?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleRotateSecrets();
            }}
            isPending={rotateSecrets.isPending}
            isDisabled={rotateSecrets.isPending}
          >
            Rotate Secrets
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
