import { TriangleAlertIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Alert, AlertDescription, ConfirmationAlertDialog } from "@app/components/v3";
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
    <ConfirmationAlertDialog
      isOpen={isOpen}
      title={`Are you sure you want to rotate ${name}?`}
      description={
        <>
          <p>This generates new key material and increments the key version.</p>
          <Alert variant="warning" className="mt-3">
            <TriangleAlertIcon />
            <AlertDescription>
              <p>
                <strong>Data encrypted outside Infisical may be affected</strong>
              </p>
              <p>
                Data encrypted through Infisical stays decryptable. However, any system that holds
                this key&apos;s material directly, such as a KMIP client or an exported copy of the
                key, will receive the new material and may be unable to decrypt data it encrypted
                with the previous version. Do not rotate a key that is in use over KMIP.
              </p>
            </AlertDescription>
          </Alert>
        </>
      }
      onOpenChange={onOpenChange}
      confirmKey="confirm"
      confirmLabel="Rotate"
      onConfirm={handleRotateCmek}
    />
  );
};
