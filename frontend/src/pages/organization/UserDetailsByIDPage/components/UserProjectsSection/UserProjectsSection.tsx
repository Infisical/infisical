import { PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog
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
      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>Manage user project memberships</CardDescription>
          {canAddToProject && Boolean(projectMemberships?.length) && (
            <CardAction>
              <Button
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
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <UserProjectsTable
            membershipId={membershipId}
            handlePopUpOpen={handlePopUpOpen}
            canAddToProject={canAddToProject}
            username={membership.user.username}
          />
        </CardContent>
      </Card>
      <UserAddToProjectModal
        membershipId={membershipId}
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
      />
      <ConfirmationAlertDialog
        isOpen={popUp.removeUserFromProject.isOpen}
        confirmKey="remove"
        title={`Do you want to remove this user from ${
          (popUp?.removeUserFromProject?.data as { projectName: string })?.projectName || ""
        }?`}
        description="This action is irreversible."
        onOpenChange={(isOpen) => handlePopUpToggle("removeUserFromProject", isOpen)}
        onConfirm={() => {
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
