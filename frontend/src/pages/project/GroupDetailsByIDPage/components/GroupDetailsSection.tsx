import { format } from "date-fns";
import { CheckIcon, ClipboardListIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Tooltip } from "@app/components/v2";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  IconButton
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
    <Card className="w-full lg:max-w-[24rem]">
      <CardHeader className="border-b">
        <CardTitle>Details</CardTitle>
        <CardDescription>Group details</CardDescription>
      </CardHeader>
      <CardContent>
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
                <IconButton
                  onClick={() => {
                    navigator.clipboard.writeText(group.id);
                    setCopyTextId("Copied");
                  }}
                  variant="ghost"
                  size="xs"
                >
                  {/* TODO(scott): color this should be a button variant and create re-usable copy button */}
                  {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                </IconButton>
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
                    roles={groupMembership.roles}
                    groupId={groupMembership.group.id}
                    groupName={groupMembership.group.name}
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
      </CardContent>
    </Card>
  );
};
