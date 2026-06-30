import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
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
      subTitle="This generates new key material and increments the key version."
      onChange={onOpenChange}
      deleteKey="confirm"
      buttonText="Rotate"
      onDeleteApproved={handleRotateCmek}
      formContent={
        <NoticeBannerV2 title="Data encrypted outside Infisical may be affected" className="mb-4">
          <p className="text-sm text-mineshaft-300">
            Data encrypted through Infisical stays decryptable. However, any system that holds this
            key&apos;s material directly, such as a KMIP client or an exported copy of the key, will
            receive the new material and may be unable to decrypt data it encrypted with the
            previous version. Do not rotate a key that is in use over KMIP.
          </p>
        </NoticeBannerV2>
      }
    />
  );
};
