import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, IconButton } from "@app/components/v2";
import { useOrganization, useUser } from "@app/context";
import { useDeleteUserFromWorkspace, useGetOrgMembership } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { UserAddToProjectModal } from "./UserAddToProjectModal";
import { UserProjectsTable } from "./UserProjectsTable";

type Props = {
  membershipId: string;
};

export const UserProjectsSection = ({ membershipId }: Props) => {
  const { user } = useUser();
  const { currentOrg } = useOrganization();

  const userId = user?.id || "";
  const orgId = currentOrg?.id || "";

  const { data: membership } = useGetOrgMembership(orgId, membershipId);

  const { mutateAsync: removeUserFromWorkspace } = useDeleteUserFromWorkspace();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addUserToProject",
    "removeUserFromProject"
  ] as const);

  const handleRemoveUser = async (projectId: string, username: string) => {
    try {
      await removeUserFromWorkspace({ workspaceId: projectId, usernames: [username], orgId });
      createNotification({
        text: "Successfully removed user from project",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to remove user from the project",
        type: "error"
      });
    }
    handlePopUpClose("removeUserFromProject");
  };

  return membership ? (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Projects</h3>
        {userId !== membership.user.id && membership.status !== "invited" && (
          <IconButton
            ariaLabel="copy icon"
            variant="plain"
            className="group relative"
            onClick={() => {
              handlePopUpOpen("addUserToProject", {
                username: membership.user.username
              });
            }}
          >
            <FontAwesomeIcon icon={faPlus} />
          </IconButton>
        )}
      </div>
      <div className="py-4">
        <UserProjectsTable membershipId={membershipId} handlePopUpOpen={handlePopUpOpen} />
      </div>
      <UserAddToProjectModal
        membershipId={membershipId}
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
      />
      <DeleteActionModal
        isOpen={popUp.removeUserFromProject.isOpen}
        deleteKey="remove"
        title={`Do you want to remove this user from ${
          (popUp?.removeUserFromProject?.data as { projectName: string })?.projectName || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("removeUserFromProject", isOpen)}
        onDeleteApproved={() => {
          const popupData = popUp?.removeUserFromProject?.data as {
            username: string;
            projectId: string;
            projectName: string;
          };

          return handleRemoveUser(popupData.projectId, popupData.username);
        }}
      />
    </div>
  ) : (
    <div />
  );
};
