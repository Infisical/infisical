import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton } from "@app/components/v2";
import { OrgPermissionGroupActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import {
  useOidcManageGroupMembershipsEnabled,
  useRemoveIdentityFromGroup,
  useRemoveUserFromGroup
} from "@app/hooks/api";
import { EGroupMemberType } from "@app/hooks/api/groups/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddGroupMembersModal } from "../AddGroupMemberModal";
import { GroupMembersTable } from "./GroupMembersTable";

type Props = {
  groupId: string;
  groupSlug: string;
};

type RemoveMemberData =
  | { memberType: EGroupMemberType.USER; username: string }
  | { memberType: EGroupMemberType.IDENTITY; identityId: string; name: string };

export const GroupMembersSection = ({ groupId, groupSlug }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addGroupMembers",
    "removeMemberFromGroup"
  ] as const);

  const { currentOrg } = useOrganization();

  const { data: isOidcManageGroupMembershipsEnabled = false } =
    useOidcManageGroupMembershipsEnabled(currentOrg.id);

  const { mutateAsync: removeUserFromGroupMutateAsync } = useRemoveUserFromGroup();
  const { mutateAsync: removeIdentityFromGroupMutateAsync } = useRemoveIdentityFromGroup();

  const handleRemoveMemberFromGroup = async (memberData: RemoveMemberData) => {
    if (memberData.memberType === EGroupMemberType.USER) {
      await removeUserFromGroupMutateAsync({
        groupId,
        username: memberData.username,
        slug: groupSlug
      });

      createNotification({
        text: `Successfully removed user ${memberData.username} from the group`,
        type: "success"
      });
    } else {
      await removeIdentityFromGroupMutateAsync({
        groupId,
        identityId: memberData.identityId,
        slug: groupSlug
      });

      createNotification({
        text: `Successfully removed identity ${memberData.name} from the group`,
        type: "success"
      });
    }

    handlePopUpToggle("removeMemberFromGroup", false);
  };

  const getMemberName = (memberData: RemoveMemberData) => {
    if (!memberData) return "";
    if (memberData.memberType === EGroupMemberType.USER) {
      return memberData.username;
    }
    return memberData.name;
  };

  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-medium text-mineshaft-100">Group Members</h3>
        <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
          {(isAllowed) => (
            <div className="mb-4 flex items-center justify-center">
              <IconButton
                isDisabled={!isAllowed}
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
          )}
        </OrgPermissionCan>
      </div>
      <div className="py-4">
        <GroupMembersTable
          groupId={groupId}
          groupSlug={groupSlug}
          handlePopUpOpen={handlePopUpOpen}
        />
      </div>
      <AddGroupMembersModal
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
        isOidcManageGroupMembershipsEnabled={isOidcManageGroupMembershipsEnabled}
      />
      <DeleteActionModal
        isOpen={popUp.removeMemberFromGroup.isOpen}
        title={`Are you sure you want to remove ${getMemberName(popUp?.removeMemberFromGroup?.data)} from the group?`}
        onChange={(isOpen) => handlePopUpToggle("removeMemberFromGroup", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => {
          const memberData = popUp?.removeMemberFromGroup?.data as RemoveMemberData;
          return handleRemoveMemberFromGroup(memberData);
        }}
      />
    </div>
  );
};
