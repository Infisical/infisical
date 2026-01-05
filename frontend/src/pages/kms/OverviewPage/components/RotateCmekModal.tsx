import { useEffect, useState } from "react";
import { faCheckCircle, faRotate, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { formatKmsDate, TCmek, useRotateCmek } from "@app/hooks/api/cmeks";

type Props = {
  cmek: TCmek | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const RotateCmekModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  const rotateCmek = useRotateCmek();
  const [rotationResult, setRotationResult] = useState<{
    version: number;
    rotatedAt: string | null;
  } | null>(null);

  // Reset state when modal closes or cmek changes
  useEffect(() => {
    if (!isOpen) {
      setRotationResult(null);
    }
  }, [isOpen]);

  if (!cmek) return null;

  const { id: keyId, name, version: currentVersion, projectId } = cmek;

  const handleRotateKey = async () => {
    try {
      const result = await rotateCmek.mutateAsync({ keyId, projectId });

      setRotationResult({
        version: result.key.version,
        rotatedAt: result.key.rotatedAt
      });

      createNotification({
        text: `Key "${name}" successfully rotated to version ${result.key.version}`,
        type: "success"
      });
    } catch {
      // Error handled by global handler
    }
  };

  const handleClose = () => {
    setRotationResult(null);
    onOpenChange(false);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleClose}>
      <ModalContent
        title="Rotate Key"
        subTitle={
          <>
            Rotate encryption key <span className="font-bold">{name}</span>
          </>
        }
      >
        {rotationResult ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-md border border-green-500/30 bg-green-500/10 p-4">
              <FontAwesomeIcon icon={faCheckCircle} className="text-2xl text-green-500" />
              <div>
                <p className="font-medium text-mineshaft-100">Key Successfully Rotated</p>
                <p className="text-sm text-mineshaft-300">
                  New version: <span className="font-mono font-bold">{rotationResult.version}</span>
                </p>
                <p className="text-sm text-mineshaft-300">
                  Rotated at:{" "}
                  <span className="font-mono">{formatKmsDate(rotationResult.rotatedAt)}</span>
                </p>
              </div>
            </div>
            <p className="text-sm text-mineshaft-300">
              The key has been rotated. Existing data encrypted with previous versions can still be
              decrypted. New encryptions will use the latest key version.
            </p>
            <div className="flex items-center">
              <ModalClose asChild>
                <Button colorSchema="secondary" onClick={handleClose}>
                  Close
                </Button>
              </ModalClose>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-4">
              <FontAwesomeIcon icon={faWarning} className="text-2xl text-yellow-500" />
              <div>
                <p className="font-medium text-mineshaft-100">Important</p>
                <p className="text-sm text-mineshaft-300">
                  Key rotation generates new key material. Previous versions are preserved for
                  decrypting existing data.
                </p>
              </div>
            </div>
            <div className="text-sm text-mineshaft-300">
              <p>
                Current version: <span className="font-mono font-bold">{currentVersion}</span>
              </p>
              <p className="mt-1">
                After rotation, a new version will be created for encrypting new data.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Button
                colorSchema="primary"
                leftIcon={<FontAwesomeIcon icon={faRotate} />}
                onClick={handleRotateKey}
                isLoading={rotateCmek.isPending}
                isDisabled={rotateCmek.isPending}
              >
                Rotate Key
              </Button>
              <ModalClose asChild>
                <Button colorSchema="secondary" variant="plain">
                  Cancel
                </Button>
              </ModalClose>
            </div>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
