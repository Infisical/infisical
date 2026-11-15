import { useEffect, useState } from "react";

import { createNotification } from "@app/components/notifications";
import { Field, FieldContent, FieldDescription, FieldLabel, Toggle } from "@app/components/v3";
import { ConfirmationAlertDialog } from "@app/components/v3/platform";
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

  useEffect(() => {
    if (!isOpen) {
      setRevokeGeneratedCredentials(false);
      setDeleteSecrets(false);
    }
  }, [isOpen]);

  if (!secretRotation) return null;

  const { id: rotationId, name, type, projectId, folder } = secretRotation;

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

    if (onComplete) onComplete();
    onOpenChange(false);
  };

  return (
    <ConfirmationAlertDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Are you sure you want to delete ${name}?`}
      description="This action is irreversible."
      confirmKey={name}
      onConfirm={handleDeleteSecretRotation}
    >
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="revoke-credentials">Revoke Credentials</FieldLabel>
          <FieldDescription>
            Generated credentials will {revokeGeneratedCredentials ? "" : "not"} be revoked on
            deletion{revokeGeneratedCredentials ? "" : " and remain active"}.
          </FieldDescription>
        </FieldContent>
        <Toggle
          id="revoke-credentials"
          variant="danger"
          checked={revokeGeneratedCredentials}
          onCheckedChange={setRevokeGeneratedCredentials}
        />
      </Field>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="delete-secrets">Delete Secrets</FieldLabel>
          <FieldDescription>
            Rotation secrets will {deleteSecrets ? "" : "not"} be removed from your project on
            deletion.
          </FieldDescription>
        </FieldContent>
        <Toggle
          id="delete-secrets"
          variant="danger"
          checked={deleteSecrets}
          onCheckedChange={setDeleteSecrets}
        />
      </Field>
    </ConfirmationAlertDialog>
  );
};
