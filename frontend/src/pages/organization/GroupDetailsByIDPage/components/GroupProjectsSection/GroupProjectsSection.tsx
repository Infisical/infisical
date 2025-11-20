import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton } from "@app/components/v2";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "@app/context";
import { useDeleteGroupFromWorkspace as useRemoveProjectFromGroup } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddGroupProjectModal } from "../AddGroupProjectModal";
import { GroupProjectsTable } from "./GroupProjectsTable";

type Props = {
  groupId: string;
  groupSlug: string;
};

export const GroupProjectsSection = ({ groupId, groupSlug }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addGroupProjects",
    "removeProjectFromGroup"
  ] as const);

  const { mutateAsync: removeProjectFromGroupMutateAsync } = useRemoveProjectFromGroup();

  const handleRemoveProjectFromGroup = async (projectId: string, projectName: string) => {
    await removeProjectFromGroupMutateAsync({
      groupId,
      projectId
    });

    createNotification({
      text: `Successfully removed group from project ${projectName}`,
      type: "success"
    });

    handlePopUpToggle("removeProjectFromGroup", false);
  };

  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-medium text-mineshaft-100">Projects</h3>
        <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
          {(isAllowed) => (
            <IconButton
              isDisabled={!isAllowed}
              ariaLabel="add project"
              variant="plain"
              className="group relative"
              onClick={() => {
                handlePopUpOpen("addGroupProjects", {
                  groupId,
                  slug: groupSlug
                });
              }}
            >
              <FontAwesomeIcon icon={faPlus} />
            </IconButton>
          )}
        </OrgPermissionCan>
      </div>
      <div className="py-4">
        <GroupProjectsTable
          groupId={groupId}
          groupSlug={groupSlug}
          handlePopUpOpen={handlePopUpOpen}
        />
      </div>
      <AddGroupProjectModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.removeProjectFromGroup.isOpen}
        title={`Are you sure you want to remove the group from ${
          (popUp?.removeProjectFromGroup?.data as { projectName: string })?.projectName || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("removeProjectFromGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => {
          const projectData = popUp?.removeProjectFromGroup?.data as {
            projectId: string;
            projectName: string;
          };

          return handleRemoveProjectFromGroup(projectData.projectId, projectData.projectName);
        }}
      />
    </div>
  );
};
