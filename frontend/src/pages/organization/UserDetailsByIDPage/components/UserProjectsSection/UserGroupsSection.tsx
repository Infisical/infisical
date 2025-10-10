import { useCallback } from "react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
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

  const handleRemoveUserFromGroup = useCallback(async (groupId: string, groupSlug: string) => {
    try {
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
    } catch {
      createNotification({
        type: "error",
        text: "Failed to remove user from group"
      });
    }
  }, []);

  return (
    <>
      <div className="border-mineshaft-600 bg-mineshaft-900 w-full rounded-lg border p-4">
        <div className="border-mineshaft-400 mb-4 flex items-center justify-between border-b pb-4">
          <h3 className="text-mineshaft-100 text-lg font-medium">Groups</h3>
        </div>

        <UserGroupsTable orgMembership={orgMembership} handlePopUpOpen={handlePopUpOpen} />
      </div>

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
