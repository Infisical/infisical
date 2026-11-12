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

import { UserAddToProductModal } from "./UserAddToProductModal";
import { getUserProjectsFirstPageParams, UserProjectsTable } from "./UserProjectsTable";

type Props = {
  membershipId: string;
};

export const UserProjectsSection = ({ membershipId }: Props) => {
  const { user } = useUser();
  const { currentOrg } = useOrganization();

  const userId = user?.id || "";
  const orgId = currentOrg?.id || "";

  const { data: membership } = useGetOrgMembership(orgId, membershipId);
  const { data: projectMemberships } = useGetOrgMembershipProjectMemberships(
    orgId,
    membershipId,
    getUserProjectsFirstPageParams()
  );

  const { mutateAsync: removeUserFromWorkspace } = useDeleteUserFromWorkspace();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addUserToProduct",
    "removeUserFromProject"
  ] as const);

  const handleRemoveUser = async (projectId: string, projectType: string, username: string) => {
    await removeUserFromWorkspace({ projectId, projectType, usernames: [username], orgId });
    createNotification({
      text: "Successfully removed user",
      type: "success"
    });
    handlePopUpClose("removeUserFromProject");
  };

  if (!membership) {
    return null;
  }

  const canAddToProduct = userId !== membership.user.id;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>Manage the products and projects this user can access</CardDescription>
          {canAddToProduct && Boolean(projectMemberships?.totalCount) && (
            <CardAction>
              <Button
                onClick={() => {
                  handlePopUpOpen("addUserToProduct", {
                    username: membership.user.username
                  });
                }}
                size="xs"
                variant="outline"
              >
                <PlusIcon />
                Add to Product
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <UserProjectsTable
            membershipId={membershipId}
            handlePopUpOpen={handlePopUpOpen}
            canAddToProduct={canAddToProduct}
            username={membership.user.username}
          />
        </CardContent>
      </Card>
      <UserAddToProductModal
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
            projectType: string;
            projectName: string;
          };

          return handleRemoveUser(popupData.projectId, popupData.projectType, popupData.username);
        }}
      />
    </>
  );
};
