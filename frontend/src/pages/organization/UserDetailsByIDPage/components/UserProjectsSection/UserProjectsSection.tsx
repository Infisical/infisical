import { PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import {
  UnstableButton,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { useOrganization, useUser } from "@app/context";
import {
  useDeleteUserFromWorkspace,
  useGetOrgMembership,
  useGetOrgMembershipProjectMemberships
} from "@app/hooks/api";
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
  const { data: projectMemberships } = useGetOrgMembershipProjectMemberships(orgId, membershipId);

  const { mutateAsync: removeUserFromWorkspace } = useDeleteUserFromWorkspace();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addUserToProject",
    "removeUserFromProject"
  ] as const);

  const handleRemoveUser = async (projectId: string, username: string) => {
    await removeUserFromWorkspace({ projectId, usernames: [username], orgId });
    createNotification({
      text: "Successfully removed user from project",
      type: "success"
    });
    handlePopUpClose("removeUserFromProject");
  };

  if (!membership) {
    return null;
  }

  const canAddToProject = userId !== membership.user.id;

  return (
    <>
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>Projects</UnstableCardTitle>
          <UnstableCardDescription>Manage user project memberships</UnstableCardDescription>
          {canAddToProject && Boolean(projectMemberships?.length) && (
            <UnstableCardAction>
              <UnstableButton
                onClick={() => {
                  handlePopUpOpen("addUserToProject", {
                    username: membership.user.username
                  });
                }}
                size="xs"
                variant="outline"
              >
                <PlusIcon />
                Add to Project
              </UnstableButton>
            </UnstableCardAction>
          )}
        </UnstableCardHeader>
        <UnstableCardContent>
          <UserProjectsTable
            membershipId={membershipId}
            handlePopUpOpen={handlePopUpOpen}
            canAddToProject={canAddToProject}
            username={membership.user.username}
          />
        </UnstableCardContent>
      </UnstableCard>
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
    </>
  );
};
