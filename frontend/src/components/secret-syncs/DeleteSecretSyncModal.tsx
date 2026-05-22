import { useEffect, useState } from "react";
import { Trash2Icon } from "lucide-react";

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
  AlertDialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  Input,
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
  const [inputData, setInputData] = useState("");
  const [removeSecrets, setRemoveSecrets] = useState(false);

  useEffect(() => {
    setInputData("");
    setRemoveSecrets(false);
  }, [isOpen]);

  if (!secretSync) return null;

  const { id: syncId, name, destination, projectId } = secretSync;
  const destinationName = SECRET_SYNC_MAP[destination].name;
  const isConfirmed = inputData === name;

  const handleDeleteSecretSync = async () => {
    if (!isConfirmed) return;

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
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Are you sure you want to delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
        </AlertDialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleDeleteSecretSync();
          }}
        >
          <Field>
            <FieldLabel>
              Type <span className="font-bold">{name}</span> to confirm
            </FieldLabel>
            <FieldContent>
              <Input
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                placeholder={`Type ${name} here`}
                autoComplete="off"
              />
            </FieldContent>
          </Field>
        </form>
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
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={handleDeleteSecretSync}
            disabled={!isConfirmed}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
