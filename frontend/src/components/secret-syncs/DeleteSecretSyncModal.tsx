import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, Switch } from "@app/components/v2";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { TSecretSync, useDeleteSecretSync } from "@app/hooks/api/secretSyncs";

type Props = {
  secretSync?: TSecretSync;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete?: () => void;
};

export const DeleteSecretSyncModal = ({ isOpen, onOpenChange, secretSync, onComplete }: Props) => {
  const deleteSync = useDeleteSecretSync();
  const [removeSecrets, setRemoveSecrets] = useState(false);

  if (!secretSync) return null;

  const { id: syncId, name, destination, projectId } = secretSync;

  const handleDeleteSecretSync = async () => {
    const destinationName = SECRET_SYNC_MAP[destination].name;

    try {
      await deleteSync.mutateAsync({
        syncId,
        destination,
        removeSecrets,
        projectId
      });

      createNotification({
        text: `Successfully removed ${destinationName} Sync`,
        type: "success"
      });

      if (onComplete) onComplete();
      onOpenChange(false);
    } catch (err) {
      console.error(err);

      createNotification({
        text: `Failed to remove ${destinationName} Sync`,
        type: "error"
      });
    }
  };

  return (
    <DeleteActionModal
      isOpen={isOpen}
      onChange={onOpenChange}
      title={`Are you sure you want to delete ${name}?`}
      deleteKey={name}
      onDeleteApproved={handleDeleteSecretSync}
    >
      <Switch
        containerClassName="mt-4"
        className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-red/50"
        thumbClassName="bg-mineshaft-800"
        isChecked={removeSecrets}
        onCheckedChange={setRemoveSecrets}
        id="remove-secrets"
      >
        Remove Synced Secrets
      </Switch>
    </DeleteActionModal>
  );
};
