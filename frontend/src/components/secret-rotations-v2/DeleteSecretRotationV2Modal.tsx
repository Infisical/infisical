import { useEffect, useState } from "react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, Switch } from "@app/components/v2";
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

    try {
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
    } catch {
      createNotification({
        text: `Failed to delete ${rotationType} Rotation`,
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
      onDeleteApproved={handleDeleteSecretRotation}
    >
      <Switch
        containerClassName="mt-4"
        className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-red/50"
        thumbClassName="bg-mineshaft-800"
        isChecked={revokeGeneratedCredentials}
        onCheckedChange={setRevokeGeneratedCredentials}
        id="revoke-credentials"
      >
        Revoke Credentials
      </Switch>
      <p className="mt-1 font-inter text-sm text-mineshaft-400">
        Generated credentials will {revokeGeneratedCredentials ? "" : "not"} be revoked on deletion
        {revokeGeneratedCredentials ? "" : " and remain active"}.
      </p>
      <Switch
        containerClassName="mt-4"
        className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-red/50"
        thumbClassName="bg-mineshaft-800"
        isChecked={deleteSecrets}
        onCheckedChange={setDeleteSecrets}
        id="delete-secrets"
      >
        Delete Secrets
      </Switch>
      <p className="mt-1 font-inter text-sm text-mineshaft-400">
        Rotation secrets will {deleteSecrets ? "" : "not"} be removed from your project on deletion.
      </p>
    </DeleteActionModal>
  );
};
