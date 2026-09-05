import { useEffect, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldTitle,
  Switch
} from "@app/components/v3";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { TSecretSync, useDeleteSecretSync, useSecretSyncOption } from "@app/hooks/api/secretSyncs";

type Props = {
  secretSync?: TSecretSync;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete?: () => void;
};

export const DeleteSecretSyncModal = ({ isOpen, onOpenChange, secretSync, onComplete }: Props) => {
  const deleteSync = useDeleteSecretSync();
  const { syncOption } = useSecretSyncOption(secretSync?.destination);
  const [removeSecrets, setRemoveSecrets] = useState(false);

  useEffect(() => {
    setRemoveSecrets(false);
  }, [isOpen]);

  if (!secretSync) return null;

  const { id: syncId, name, destination, projectId } = secretSync;
  const destinationName = SECRET_SYNC_MAP[destination].name;

  const handleDeleteSecretSync = async () => {
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

    onComplete?.();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} confirmationValue={name} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to delete {name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <Alert variant="danger" appearance="borderless">
              <AlertDescription>This action is irreversible.</AlertDescription>
            </Alert>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogConfirmationField
          onConfirm={() => {
            if (!deleteSync.isPending) handleDeleteSecretSync().catch(() => undefined);
          }}
        />
        {syncOption?.canRemoveSecretsOnDeletion && (
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Remove Synced Secrets</FieldTitle>
              <FieldDescription>
                Also delete the secrets synced to {destinationName}. This cannot be undone.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="remove-secrets"
              variant="danger"
              checked={removeSecrets}
              onCheckedChange={setRemoveSecrets}
            />
          </Field>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={deleteSync.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isPending={deleteSync.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!deleteSync.isPending) handleDeleteSecretSync().catch(() => undefined);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
