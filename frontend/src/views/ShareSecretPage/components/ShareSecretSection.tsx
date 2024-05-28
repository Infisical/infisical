import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, Checkbox, DeleteActionModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useDeleteSharedSecret } from "@app/hooks/api/secretSharing";

import { AddShareSecretModal } from "./AddShareSecretModal";
import { ShareSecretsTable } from "./ShareSecretsTable";

type DeleteModalData = { name: string; id: string };

export const ShareSecretSection = withProjectPermission(
  () => {
    const { currentWorkspace } = useWorkspace();
    const deleteSharedSecret = useDeleteSharedSecret();
    const [showExpiredSharedSecrets, setShowExpiredSharedSecrets] = useState(false);

    const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
      "createSharedSecret",
      "deleteSharedSecretConfirmation"
    ] as const);

    const onDeleteApproved = async () => {
      try {
        if (!currentWorkspace?.id) return;
        deleteSharedSecret.mutateAsync({
          sharedSecretId: (popUp?.deleteSharedSecretConfirmation?.data as DeleteModalData)?.id,
          workspaceId: currentWorkspace.id
        });
        createNotification({
          text: "Successfully deleted shared secret",
          type: "success"
        });

        handlePopUpClose("deleteSharedSecretConfirmation");
      } catch (err) {
        console.error(err);
        createNotification({
          text: "Failed to delete shared secret",
          type: "error"
        });
      }
    };

    return (
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-2 flex justify-between">
          <p className="text-xl font-semibold text-mineshaft-100">Shared Secrets</p>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.SecretSharing}
          >
            {(isAllowed) => (
              <Button
                colorSchema="primary"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => {
                  handlePopUpOpen("createSharedSecret");
                }}
                isDisabled={!isAllowed}
              >
                Share Secret
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
        <div className="mb-8 flex items-center justify-between">
          <p className="flex-grow text-gray-400">
            Every secret shared can be accessed with the URL (shown during creation) before its
            expiry.
          </p>
          <Checkbox
            className="shrink-0 data-[state=checked]:bg-primary"
            id="showInactive"
            isChecked={showExpiredSharedSecrets}
            onCheckedChange={(state) => {
              setShowExpiredSharedSecrets(state as boolean);
            }}
          >
            Show expired shared secrets too
          </Checkbox>
        </div>
        <ShareSecretsTable
          handlePopUpOpen={handlePopUpOpen}
          showExpiredSharedSecrets={showExpiredSharedSecrets}
        />
        <AddShareSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
        <DeleteActionModal
          isOpen={popUp.deleteSharedSecretConfirmation.isOpen}
          title={`Delete ${
            (popUp?.deleteSharedSecretConfirmation?.data as DeleteModalData)?.name || " "
          } shared secret?`}
          onChange={(isOpen) => handlePopUpToggle("deleteSharedSecretConfirmation", isOpen)}
          deleteKey={(popUp?.deleteSharedSecretConfirmation?.data as DeleteModalData)?.name}
          onClose={() => handlePopUpClose("deleteSharedSecretConfirmation")}
          onDeleteApproved={onDeleteApproved}
        />
      </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.SecretSharing }
);
