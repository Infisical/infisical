import { format } from "date-fns";
import { CheckIcon, ClipboardListIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Tooltip } from "@app/components/v2";
import {
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { TGroupMembership } from "@app/hooks/api/groups/types";
import { GroupRoles } from "@app/pages/project/AccessControlPage/components/GroupsTab/components/GroupsSection/GroupRoles";

type Props = {
  groupMembership: TGroupMembership;
};

export const GroupDetailsSection = ({ groupMembership }: Props) => {
  const { group } = groupMembership;

  // eslint-disable-next-line @typescript-eslint/naming-convention,@typescript-eslint/no-unused-vars
  const [_, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  return (
    <UnstableCard className="w-full lg:max-w-[24rem]">
      <UnstableCardHeader className="border-b">
        <UnstableCardTitle>Details</UnstableCardTitle>
        <UnstableCardDescription>Group details</UnstableCardDescription>
      </UnstableCardHeader>
      <UnstableCardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{group.name}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>ID</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              {group.id}
              <Tooltip content="Copy group ID to clipboard">
                <UnstableIconButton
                  onClick={() => {
                    navigator.clipboard.writeText(group.id);
                    setCopyTextId("Copied");
                  }}
                  variant="ghost"
                  size="xs"
                >
                  {/* TODO(scott): color this should be a button variant and create re-usable copy button */}
                  {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                </UnstableIconButton>
              </Tooltip>
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Project Role</DetailLabel>
            <DetailValue>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.Groups}
              >
                {(isAllowed) => (
                  <GroupRoles
                    popperContentProps={{ side: "right" }}
                    roles={groupMembership.roles}
                    groupId={groupMembership.group.id}
                    disableEdit={!isAllowed}
                  />
                )}
              </ProjectPermissionCan>
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Joined project</DetailLabel>
            <DetailValue>{format(groupMembership.createdAt, "PPpp")}</DetailValue>
          </Detail>
        </DetailGroup>
      </UnstableCardContent>
    </UnstableCard>
  );
};
