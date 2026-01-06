import { useCallback } from "react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import {
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
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
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>Groups</UnstableCardTitle>
          <UnstableCardDescription>Manage user group memberships</UnstableCardDescription>
        </UnstableCardHeader>
        <UnstableCardContent>
          <UserGroupsTable orgMembership={orgMembership} handlePopUpOpen={handlePopUpOpen} />
        </UnstableCardContent>
      </UnstableCard>

      <DeleteActionModal
        isOpen={popUp.removeUserFromGroup.isOpen}
        title="Are you sure you want to unassign user from group?"
        onChange={(isOpen) => handlePopUpToggle("removeUserFromGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => {
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
