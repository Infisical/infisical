import { useMemo } from "react";
import {
  BanIcon,
  ClipboardCheckIcon,
  EllipsisVerticalIcon,
  InfoIcon,
  PencilIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon
} from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Detail,
  DetailLabel,
  DetailValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionActions } from "@app/context/ProjectPermissionContext/types";
import { getMemberLabel } from "@app/helpers/members";
import { policyDetails } from "@app/helpers/policies";
import { Approver } from "@app/hooks/api/accessApproval/types";
import { TGroupMembership } from "@app/hooks/api/groups/types";
import { EnforcementLevel, PolicyType } from "@app/hooks/api/policies/enums";
import { ApproverType } from "@app/hooks/api/secretApproval/types";
import { ProjectEnv } from "@app/hooks/api/types";
import { TWorkspaceUser } from "@app/hooks/api/users/types";

interface IPolicy {
  id: string;
  name: string;
  environments: ProjectEnv[];
  projectId?: string;
  secretPath?: string;
  approvals: number;
  approvers?: Approver[];
  updatedAt: Date;
  policyType: PolicyType;
  enforcementLevel: EnforcementLevel;
}

type Props = {
  policy: IPolicy;
  members?: TWorkspaceUser[];
  groups?: TGroupMembership[];
  onEdit: () => void;
  onDelete: () => void;
};

export const ApprovalPolicyRow = ({
  policy,
  members = [],
  groups = [],
  onEdit,
  onDelete
}: Props) => {
  const labels = useMemo(() => {
    const sortedSteps = policy.approvers?.sort((a, b) => (a?.sequence || 0) - (b?.sequence || 0));
    const entityInSameSequence = sortedSteps?.reduce(
      (acc, curr) => {
        if (acc.length && acc[acc.length - 1].sequence === (curr.sequence || 1)) {
          acc[acc.length - 1][curr.type]?.push(curr);
          return acc;
        }
        const approvals = curr.approvalsRequired || policy.approvals;
        acc.push(
          curr.type === ApproverType.User
            ? { user: [curr], group: [], sequence: 1, approvals }
            : { group: [curr], user: [], sequence: 1, approvals }
        );
        return acc;
      },
      [] as { user: Approver[]; group: Approver[]; sequence?: number; approvals: number }[]
    );

    return entityInSameSequence?.map((el) => {
      return {
        sequence: el.sequence || policy.approvals,

        users: el.user.map((approver) => {
          const member = members.find((m) => m.user.id === approver.id);
          return { member, approver };
        }),

        groupLabels: groups
          ?.filter(({ group }) => el.group.find((i) => i.id === group.id))
          .map(({ group }) => group.name)
          .join(", "),
        approvals: el.approvals
      };
    });
  }, [policy, members, groups]);

  const { variant, Icon } = policyDetails[policy.policyType];

  const environmentNames = policy.environments.map((env) => env.name).join(", ");

  return (
    <TableRow>
      <TableCell isTruncatable className="w-1/3" title={policy.name || "Unnamed Policy"}>
        {policy.name || <span className="text-muted">Unnamed Policy</span>}
      </TableCell>
      <TableCell isTruncatable className="w-1/3" title={environmentNames}>
        {environmentNames}
      </TableCell>
      <TableCell isTruncatable className="w-1/3" title={policy.secretPath || "*"}>
        {policy.secretPath || "*"}
      </TableCell>
      <TableCell>
        <Badge variant={variant}>
          <Icon />
          <span>{policyDetails[policy.policyType].name}</span>
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <HoverCard openDelay={100}>
            <HoverCardTrigger asChild>
              <IconButton aria-label="View approvers" variant="ghost-muted" size="xs">
                <InfoIcon />
              </IconButton>
            </HoverCardTrigger>
            <HoverCardContent
              align="end"
              className="max-h-96 thin-scrollbar w-80 overflow-y-auto p-4"
            >
              <div className="mb-3 text-sm font-medium text-foreground">Approvers</div>
              {labels && labels.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {labels.map((el, index) => (
                    <div
                      key={`approval-list-${index + 1}`}
                      className="flex flex-col gap-2.5 border-b border-border pb-4 last:border-0 last:pb-0"
                    >
                      {labels.length > 1 && (
                        <Badge variant="neutral" className="w-fit">
                          Step {index + 1}
                        </Badge>
                      )}
                      <Detail>
                        <DetailLabel className="flex items-center gap-1.5">
                          <UserIcon className="size-3" />
                          Users
                        </DetailLabel>
                        <DetailValue>
                          {el.users.length ? (
                            <div className="flex flex-row flex-wrap gap-x-1 gap-y-1">
                              {el.users.map(({ member, approver }, idx) => {
                                const isLast = idx === el.users.length - 1;

                                if (!member) {
                                  return (
                                    <span key={approver.id} className="flex items-center gap-1">
                                      <span className="flex items-center gap-1.5 opacity-40">
                                        {approver.name || approver.id}
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Badge variant="neutral">
                                              <BanIcon />
                                              Removed
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            This user has been removed from the project.
                                          </TooltipContent>
                                        </Tooltip>
                                      </span>
                                      {!isLast && ","}
                                    </span>
                                  );
                                }

                                return member.user.isOrgMembershipActive ? (
                                  <span key={member.id}>
                                    {getMemberLabel(member)}
                                    {!isLast && ","}
                                  </span>
                                ) : (
                                  <span key={member.id} className="flex items-center gap-1">
                                    <span className="flex items-center gap-1.5 opacity-40">
                                      {getMemberLabel(member)}
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Badge variant="neutral">
                                            <BanIcon />
                                            Inactive
                                          </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          This user has been deactivated and no longer has an active
                                          organization membership.
                                        </TooltipContent>
                                      </Tooltip>
                                    </span>
                                    {!isLast && ","}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-muted">None</span>
                          )}
                        </DetailValue>
                      </Detail>
                      <Detail>
                        <DetailLabel className="flex items-center gap-1.5">
                          <UsersIcon className="size-3" />
                          Groups
                        </DetailLabel>
                        <DetailValue>
                          {el.groupLabels || <span className="text-muted">None</span>}
                        </DetailValue>
                      </Detail>
                      <Detail>
                        <DetailLabel className="flex items-center gap-1.5">
                          <ClipboardCheckIcon className="size-3" />
                          Approvals Required
                        </DetailLabel>
                        <DetailValue>{el.approvals}</DetailValue>
                      </Detail>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted">No approvers configured.</span>
              )}
            </HoverCardContent>
          </HoverCard>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="Options" variant="ghost" size="xs">
                <EllipsisVerticalIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={2} align="end" className="min-w-48 p-1">
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.SecretApproval}
              >
                {(isAllowed) => (
                  <DropdownMenuItem onClick={onEdit} isDisabled={!isAllowed}>
                    <PencilIcon />
                    Edit Policy
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Delete}
                a={ProjectPermissionSub.SecretApproval}
              >
                {(isAllowed) => (
                  <DropdownMenuItem variant="danger" onClick={onDelete} isDisabled={!isAllowed}>
                    <Trash2Icon />
                    Delete Policy
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
};
