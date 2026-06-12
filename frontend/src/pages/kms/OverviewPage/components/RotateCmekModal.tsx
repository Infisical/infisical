import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import { TCmek, useRotateCmek } from "@app/hooks/api/cmeks";

type Props = {
  cmek: TCmek;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const RotateCmekModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  const rotateCmek = useRotateCmek();

  if (!cmek) return null;

  const { id: keyId, projectId, name } = cmek;

  const handleRotateCmek = async () => {
    await rotateCmek.mutateAsync({
      keyId,
      projectId
    });

    createNotification({
      text: "Key successfully rotated",
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <DeleteActionModal
      isOpen={isOpen}
      title={`Are you sure you want to rotate ${name}?`}
      subTitle="This generates new key material and increments the key version. Data encrypted through Infisical stays decryptable. However, any system that holds this key's material directly, such as a KMIP client or an exported copy of the key, will receive the new material and may be unable to decrypt data it encrypted with the previous version. Do not rotate a key that is in use over KMIP."
      onChange={onOpenChange}
      deleteKey="confirm"
      buttonText="Rotate"
      onDeleteApproved={handleRotateCmek}
    />
  );
};
