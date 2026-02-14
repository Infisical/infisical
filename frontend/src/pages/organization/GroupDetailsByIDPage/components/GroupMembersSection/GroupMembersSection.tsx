import { PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { OrgPermissionGroupActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import {
  useOidcManageGroupMembershipsEnabled,
  useRemoveIdentityFromGroup,
  useRemoveUserFromGroup
} from "@app/hooks/api";
import { GroupMemberType } from "@app/hooks/api/groups/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddGroupMembersModal } from "../AddGroupMemberModal";
import { GroupMembersTable } from "./GroupMembersTable";

type Props = {
  groupId: string;
  groupSlug: string;
  isLinkedGroup?: boolean;
};

type RemoveMemberData =
  | { memberType: GroupMemberType.USER; username: string }
  | { memberType: GroupMemberType.MACHINE_IDENTITY; identityId: string; name: string };

export const GroupMembersSection = ({ groupId, groupSlug, isLinkedGroup = false }: Props) => {
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
    if (memberData.memberType === GroupMemberType.USER) {
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
    if (memberData.memberType === GroupMemberType.USER) {
      return memberData.username;
    }
    return memberData.name;
  };

  return (
    <>
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>Group Members</UnstableCardTitle>
          <UnstableCardDescription>Manage members of this group</UnstableCardDescription>
          <UnstableCardAction>
            {!isLinkedGroup && (
              <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
                {(isAllowed) => (
                  <Button
                    isDisabled={!isAllowed}
                    onClick={() => {
                      handlePopUpOpen("addGroupMembers", {
                        groupId,
                        slug: groupSlug
                      });
                    }}
                    size="xs"
                    variant="outline"
                  >
                    <PlusIcon />
                    Add Member
                  </Button>
                )}
              </OrgPermissionCan>
            )}
          </UnstableCardAction>
        </UnstableCardHeader>
        <UnstableCardContent>
          <GroupMembersTable
            groupId={groupId}
            groupSlug={groupSlug}
            handlePopUpOpen={handlePopUpOpen}
            isLinkedGroup={isLinkedGroup}
          />
        </UnstableCardContent>
      </UnstableCard>
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
    </>
  );
};
