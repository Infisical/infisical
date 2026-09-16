import { format } from "date-fns";
import { CheckIcon, ClipboardListIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
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
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useTimedReset } from "@app/hooks";
import { TGroupMembership } from "@app/hooks/api/groups/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { GroupRoles } from "@app/pages/project/AccessControlPage/components/GroupsTab/components/GroupsSection/GroupRoles";

type Props = {
  groupMembership: TGroupMembership;
};

export const GroupDetailsSection = ({ groupMembership }: Props) => {
  const { group } = groupMembership;
  const { currentProject } = useProject();
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;

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
            <DetailValue className="flex items-center gap-x-1 font-mono">
              {group.id}
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    onClick={() => {
                      navigator.clipboard.writeText(group.id);
                      setCopyTextId("Copied");
                    }}
                    variant="ghost"
                    size="xs"
                    aria-label="Copy group ID"
                  >
                    {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>{isCopyingId ? "Group ID copied" : "Copy group ID"}</TooltipContent>
              </Tooltip>
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>{isCertManager ? "Certificate Manager Role" : "Project Role"}</DetailLabel>
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
            <DetailLabel>
              {isCertManager ? "Joined certificate manager" : "Joined project"}
            </DetailLabel>
            <DetailValue>{format(groupMembership.createdAt, "PPpp")}</DetailValue>
          </Detail>
        </DetailGroup>
      </CardContent>
    </Card>
  );
};
