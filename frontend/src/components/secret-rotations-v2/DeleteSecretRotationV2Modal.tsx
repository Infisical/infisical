import { useEffect, useState } from "react";
import { TrashIcon } from "lucide-react";

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
  FieldFeedback,
  FieldLabel,
  Input,
  Switch
} from "@app/components/v3";
import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { useDeleteSecretRotationV2 } from "@app/hooks/api/secretRotationsV2/mutations";

type Props = {
  secretRotation?: TSecretRotationV2;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete?: () => void;
};

export const DeleteSecretRotationV2Modal = ({
  isOpen,
  onOpenChange,
  secretRotation,
  onComplete
}: Props) => {
  const deleteSecretRotation = useDeleteSecretRotationV2();
  const [revokeGeneratedCredentials, setRevokeGeneratedCredentials] = useState(false);
  const [deleteSecrets, setDeleteSecrets] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setRevokeGeneratedCredentials(false);
      setDeleteSecrets(false);
      setConfirmation("");
    }
  }, [isOpen]);

  if (!secretRotation) return null;

  const { id: rotationId, name, type, projectId, folder } = secretRotation;
  const isConfirmed = confirmation === name;

  const handleDeleteSecretRotation = async () => {
    const rotationType = SECRET_ROTATION_MAP[type].name;

    await deleteSecretRotation.mutateAsync({
      rotationId,
      type,
      revokeGeneratedCredentials,
      deleteSecrets,
      projectId,
      secretPath: folder.path
    });

    createNotification({
      text: `Successfully deleted ${rotationType} Rotation`,
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
            <TrashIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Are you sure you want to delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove this secret rotation. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <Field orientation="horizontal">
            <div className="flex-1">
              <FieldLabel htmlFor="revoke-credentials">Revoke Credentials</FieldLabel>
              <FieldFeedback
                id="revoke-credentials-feedback"
                description={
                  revokeGeneratedCredentials
                    ? "Generated credentials will be revoked on deletion."
                    : "Generated credentials will not be revoked on deletion and remain active."
                }
              />
            </div>
            <Switch
              id="revoke-credentials"
              variant="danger"
              checked={revokeGeneratedCredentials}
              onCheckedChange={setRevokeGeneratedCredentials}
              aria-describedby="revoke-credentials-feedback"
            />
          </Field>

          <Field orientation="horizontal">
            <div className="flex-1">
              <FieldLabel htmlFor="delete-secrets">Delete Secrets</FieldLabel>
              <FieldFeedback
                id="delete-secrets-feedback"
                description={
                  deleteSecrets
                    ? "Rotation secrets will be removed from your project on deletion."
                    : "Rotation secrets will not be removed from your project on deletion."
                }
              />
            </div>
            <Switch
              id="delete-secrets"
              variant="danger"
              checked={deleteSecrets}
              onCheckedChange={setDeleteSecrets}
              aria-describedby="delete-secrets-feedback"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="delete-rotation-confirmation">
              Type <span className="font-medium text-foreground">{name}</span> to confirm
            </FieldLabel>
            <Input
              id="delete-rotation-confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={`Type ${name} here`}
              autoComplete="off"
            />
          </Field>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={(e) => {
              e.preventDefault();
              handleDeleteSecretRotation();
            }}
            isPending={deleteSecretRotation.isPending}
            isDisabled={!isConfirmed || deleteSecretRotation.isPending}
          >
            Delete Secret Rotation
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
