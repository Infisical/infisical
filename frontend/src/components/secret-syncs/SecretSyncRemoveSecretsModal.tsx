import { EraserIcon } from "lucide-react";

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
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { TSecretSync, useTriggerSecretSyncRemoveSecrets } from "@app/hooks/api/secretSyncs";

type Props = {
  secretSync?: TSecretSync;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const SecretSyncRemoveSecretsModal = ({ isOpen, onOpenChange, secretSync }: Props) => {
  const triggerRemoveSecrets = useTriggerSecretSyncRemoveSecrets();

  if (!secretSync) return null;

  const { id: syncId, destination, projectId } = secretSync;
  const destinationName = SECRET_SYNC_MAP[destination].name;

  const handleTriggerRemoveSecrets = async () => {
    await triggerRemoveSecrets.mutateAsync({
      syncId,
      destination,
      projectId
    });

    createNotification({
      text: `Successfully triggered secret removal for ${destinationName} Sync`,
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-xl!">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <EraserIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Remove synced secrets?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove synced secrets from this {destinationName} destination?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isDisabled={triggerRemoveSecrets.isPending}
            onClick={handleTriggerRemoveSecrets}
          >
            Remove Secrets
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
