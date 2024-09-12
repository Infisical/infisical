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

  const handleRemoveUserFromGroup = useCallback(async (groupSlug: string) => {
    try {
      await removeUserFromGroup({
        slug: groupSlug,
        username: orgMembership.user.username
      });

      createNotification({
        type: "success",
        text: "User removed from group successfully"
      });

      handlePopUpClose("removeUserFromGroup");
    } catch (error) {
      createNotification({
        type: "error",
        text: "Failed to remove user from group"
      });
    }
  }, []);

  return (
    <>
      <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex items-center justify-between border-b border-mineshaft-400 pb-4">
          <h3 className="text-lg font-semibold text-mineshaft-100">Groups</h3>
        </div>

        <UserGroupsTable orgMembership={orgMembership} handlePopUpOpen={handlePopUpOpen} />
      </div>

      <DeleteActionModal
        isOpen={popUp.removeUserFromGroup.isOpen}
        title="Are you sure want to unassign user from group?"
        onChange={(isOpen) => handlePopUpToggle("removeUserFromGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => {
          const popupData = popUp?.removeUserFromGroup?.data as {
            groupSlug: string;
          };

          return handleRemoveUserFromGroup(popupData.groupSlug);
        }}
      />
    </>
  );
};
