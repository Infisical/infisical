import { useCallback } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog
} from "@app/components/v3";
import { useRemoveUserFromGroup } from "@app/hooks/api";
import { OrgUser } from "@app/hooks/api/users/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { UserGroupsTable } from "./UserGroupsTable";

type Props = {
  orgMembership: OrgUser;
};

export const UserGroupsSection = ({ orgMembership }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "removeUserFromGroup"
  ] as const);

  const { mutateAsync: removeUserFromGroup } = useRemoveUserFromGroup();

  const handleRemoveUserFromGroup = useCallback(
    async (groupId: string, groupSlug: string) => {
      await removeUserFromGroup({
        groupId,
        slug: groupSlug,
        username: orgMembership.user.username
      });

      createNotification({
        type: "success",
        text: "User removed from group successfully"
      });

      handlePopUpClose("removeUserFromGroup");
    },
    [orgMembership, handlePopUpClose, createNotification]
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Groups</CardTitle>
          <CardDescription>Manage user group memberships</CardDescription>
        </CardHeader>
        <CardContent>
          <UserGroupsTable orgMembership={orgMembership} handlePopUpOpen={handlePopUpOpen} />
        </CardContent>
      </Card>

      <ConfirmationAlertDialog
        isOpen={popUp.removeUserFromGroup.isOpen}
        title="Are you sure you want to unassign user from group?"
        description="This action is irreversible."
        onOpenChange={(isOpen) => handlePopUpToggle("removeUserFromGroup", isOpen)}
        confirmKey="confirm"
        onConfirm={() => {
          const popupData = popUp?.removeUserFromGroup?.data as {
            groupId: string;
            groupSlug: string;
          };

          return handleRemoveUserFromGroup(popupData.groupId, popupData.groupSlug);
        }}
      />
    </>
  );
};
