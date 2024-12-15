import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, IconButton } from "@app/components/v2";
import { useRemoveUserFromGroup } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddGroupMembersModal } from "../AddGroupMemberModal";
import { GroupMembersTable } from "./GroupMembersTable";

type Props = {
  groupId: string;
  groupSlug: string;
};

export const GroupMembersSection = ({ groupId, groupSlug }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addGroupMembers",
    "removeMemberFromGroup"
  ] as const);

  const { mutateAsync: removeUserFromGroupMutateAsync } = useRemoveUserFromGroup();
  const handleRemoveUserFromGroup = async (username: string) => {
    try {
      await removeUserFromGroupMutateAsync({
        groupId,
        username,
        slug: groupSlug
      });

      createNotification({
        text: `Successfully removed user ${username} from the group`,
        type: "success"
      });

      handlePopUpToggle("removeMemberFromGroup", false);
    } catch (err) {
      createNotification({
        text: `Failed to remove user ${username} from the group`,
        type: "error"
      });
    }
  };

  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Group Members</h3>
        <IconButton
          ariaLabel="copy icon"
          variant="plain"
          className="group relative"
          onClick={() => {
            handlePopUpOpen("addGroupMembers", {
              groupId,
              slug: groupSlug
            });
          }}
        >
          <FontAwesomeIcon icon={faPlus} />
        </IconButton>
      </div>
      <div className="py-4">
        <GroupMembersTable
          groupId={groupId}
          groupSlug={groupSlug}
          handlePopUpOpen={handlePopUpOpen}
        />
      </div>
      <AddGroupMembersModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.removeMemberFromGroup.isOpen}
        title={`Are you sure want to remove ${
          (popUp?.removeMemberFromGroup?.data as { username: string })?.username || ""
        } from the group?`}
        onChange={(isOpen) => handlePopUpToggle("removeMemberFromGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => {
          const userData = popUp?.removeMemberFromGroup?.data as {
            username: string;
            id: string;
          };

          return handleRemoveUserFromGroup(userData.username);
        }}
      />
    </div>
  );
};
