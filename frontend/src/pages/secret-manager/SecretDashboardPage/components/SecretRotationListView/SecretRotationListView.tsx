import { DeleteSecretRotationV2Modal } from "@app/components/secret-rotations-v2/DeleteSecretRotationV2Modal";
import { EditSecretRotationV2Modal } from "@app/components/secret-rotations-v2/EditSecretRotationV2Modal";
import { RotateSecretRotationV2Modal } from "@app/components/secret-rotations-v2/RotateSecretRotationV2Modal";
import { ViewSecretRotationV2GeneratedCredentialsModal } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials";
import { usePopUp } from "@app/hooks";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationItem } from "./SecretRotationItem";

type Props = {
  secretRotations?: TSecretRotationV2[];
};

export const SecretRotationListView = ({ secretRotations }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "editSecretRotation",
    "rotateSecretRotation",
    "viewSecretRotationGeneratedCredentials",
    "deleteSecretRotation"
  ] as const);

  return (
    <>
      {secretRotations?.map((secretRotation) => (
        <SecretRotationItem
          key={secretRotation.id}
          secretRotation={secretRotation}
          onEdit={() => handlePopUpOpen("editSecretRotation", secretRotation)}
          onRotate={() => handlePopUpOpen("rotateSecretRotation", secretRotation)}
          onViewGeneratedCredentials={() =>
            handlePopUpOpen("viewSecretRotationGeneratedCredentials", secretRotation)
          }
          onDelete={() => handlePopUpOpen("deleteSecretRotation", secretRotation)}
        />
      ))}
      <EditSecretRotationV2Modal
        isOpen={popUp.editSecretRotation.isOpen}
        secretRotation={popUp.editSecretRotation.data as TSecretRotationV2}
        onOpenChange={(isOpen) => handlePopUpToggle("editSecretRotation", isOpen)}
      />
      <RotateSecretRotationV2Modal
        isOpen={popUp.rotateSecretRotation.isOpen}
        secretRotation={popUp.rotateSecretRotation.data as TSecretRotationV2}
        onOpenChange={(isOpen) => handlePopUpToggle("rotateSecretRotation", isOpen)}
      />
      <ViewSecretRotationV2GeneratedCredentialsModal
        isOpen={popUp.viewSecretRotationGeneratedCredentials.isOpen}
        secretRotation={popUp.viewSecretRotationGeneratedCredentials.data as TSecretRotationV2}
        onOpenChange={(isOpen) =>
          handlePopUpToggle("viewSecretRotationGeneratedCredentials", isOpen)
        }
      />
      <DeleteSecretRotationV2Modal
        isOpen={popUp.deleteSecretRotation.isOpen}
        secretRotation={popUp.deleteSecretRotation.data as TSecretRotationV2}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteSecretRotation", isOpen)}
      />
    </>
  );
};
