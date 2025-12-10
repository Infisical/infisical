import { DeleteSecretRotationV2Modal } from "@app/components/secret-rotations-v2/DeleteSecretRotationV2Modal";
import { EditSecretRotationV2Modal } from "@app/components/secret-rotations-v2/EditSecretRotationV2Modal";
import { RotateSecretRotationV2Modal } from "@app/components/secret-rotations-v2/RotateSecretRotationV2Modal";
import { ViewSecretRotationV2GeneratedCredentialsModal } from "@app/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials";
import { usePopUp } from "@app/hooks";
import { UsedBySecretSyncs } from "@app/hooks/api/dashboard/types";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { SecretV3RawSanitized, WsTag } from "@app/hooks/api/types";

import { SecretRotationItem } from "./SecretRotationItem";

type Props = {
  secretRotations?: TSecretRotationV2[];
  projectId: string;
  secretPath?: string;
  tags?: WsTag[];
  isProtectedBranch?: boolean;
  usedBySecretSyncs?: UsedBySecretSyncs[];
  importedBy?: {
    environment: { name: string; slug: string };
    folders: {
      name: string;
      secrets?: { secretId: string; referencedSecretKey: string; referencedSecretEnv: string }[];
      isImported: boolean;
    }[];
  }[];
  colWidth: number;
  getMergedSecretsWithPending: (
    secretParams?: (SecretV3RawSanitized | null)[]
  ) => SecretV3RawSanitized[];
};

export const SecretRotationListView = ({
  secretRotations,
  projectId,
  secretPath = "/",
  tags = [],
  isProtectedBranch = false,
  usedBySecretSyncs,
  importedBy,
  colWidth,
  getMergedSecretsWithPending
}: Props) => {
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
          colWidth={colWidth}
          tags={tags}
          projectId={projectId}
          secretPath={secretPath}
          isProtectedBranch={isProtectedBranch}
          importedBy={importedBy}
          usedBySecretSyncs={usedBySecretSyncs}
          getMergedSecretsWithPending={getMergedSecretsWithPending}
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
