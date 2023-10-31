import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { PermissionDeniedBanner, ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteWsTag } from "@app/hooks/api";

import { AddSecretTagModal } from "./AddSecretTagModal";
import { SecretTagsTable } from "./SecretTagsTable";

type DeleteModalData = { name: string; id: string };

export const SecretTagsSection = (): JSX.Element => {
  const { createNotification } = useNotificationContext();
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "CreateSecretTag",
    "deleteTagConfirmation"
  ] as const);
  const permission = useProjectPermission();

  const deleteWsTag = useDeleteWsTag();

  const onDeleteApproved = async () => {
    try {
      await deleteWsTag.mutateAsync({
        tagID: (popUp?.deleteTagConfirmation?.data as DeleteModalData)?.id
      });

      createNotification({
        text: "Successfully deleted tag",
        type: "success"
      });

      handlePopUpClose("deleteTagConfirmation");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete the tag",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 p-4 bg-mineshaft-900 rounded-lg border border-mineshaft-600">
      <div className="flex justify-between mb-8">
        <p className="mb-3 text-xl font-semibold">Secret Tags</p>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Tags}>
          {(isAllowed) => (
            <Button
              colorSchema="secondary"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => {
                handlePopUpOpen("CreateSecretTag");
              }}
              isDisabled={!isAllowed}
            >
              Create tag
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <p className="text-gray-400 mb-8">
        Every secret can be assigned to one or more tags. Here you can add and remove tags for the
        current project.
      </p>
      {permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags) ? (
        <SecretTagsTable handlePopUpOpen={handlePopUpOpen} />
      ) : (
        <PermissionDeniedBanner />
      )}
      <AddSecretTagModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <DeleteActionModal
        isOpen={popUp.deleteTagConfirmation.isOpen}
        title={`Delete ${
          (popUp?.deleteTagConfirmation?.data as DeleteModalData)?.name || " "
        } api key?`}
        onChange={(isOpen) => handlePopUpToggle("deleteTagConfirmation", isOpen)}
        deleteKey={(popUp?.deleteTagConfirmation?.data as DeleteModalData)?.name}
        onClose={() => handlePopUpClose("deleteTagConfirmation")}
        onDeleteApproved={onDeleteApproved}
      />
    </div>
  );
};
