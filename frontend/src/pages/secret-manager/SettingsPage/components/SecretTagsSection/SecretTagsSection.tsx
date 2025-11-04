import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { PermissionDeniedBanner, ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteWsTag } from "@app/hooks/api";

import { AddSecretTagModal } from "./AddSecretTagModal";
import { SecretTagsTable } from "./SecretTagsTable";

type DeleteModalData = { name: string; id: string };

export const SecretTagsSection = (): JSX.Element => {
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "CreateSecretTag",
    "deleteTagConfirmation"
  ] as const);
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();

  const deleteWsTag = useDeleteWsTag();

  const onDeleteApproved = async () => {
    await deleteWsTag.mutateAsync({
      projectId: currentProject?.id || "",
      tagID: (popUp?.deleteTagConfirmation?.data as DeleteModalData)?.id
    });

    createNotification({
      text: "Successfully deleted tag",
      type: "success"
    });

    handlePopUpClose("deleteTagConfirmation");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-8 flex justify-between">
        <p className="mb-3 text-xl font-medium">Secret Tags</p>
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
              Create Tag
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <p className="mb-8 text-gray-400">
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
