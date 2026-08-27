import { useMemo } from "react";
import { BanIcon, EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react";

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { getMemberLabel } from "@app/helpers/members";
import { policyDetails } from "@app/helpers/policies";
import { Approver } from "@app/hooks/api/accessApproval/types";
import { TGroupMembership } from "@app/hooks/api/groups/types";
import { EnforcementLevel, PolicyType } from "@app/hooks/api/policies/enums";
import { ProjectEnv } from "@app/hooks/api/types";
import { TWorkspaceUser } from "@app/hooks/api/users/types";

import { groupApproversBySequence } from "./approvalPolicyRowUtils";

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
  canEdit: boolean;
  canDelete: boolean;
  editDisabledReason?: string;
  onEdit: () => void;
  onDelete: () => void;
};

export const ApprovalPolicyRow = ({
  policy,
  members = [],
  groups = [],
  canEdit,
  canDelete,
  editDisabledReason,
  onEdit,
  onDelete
}: Props) => {
  const labels = useMemo(() => {
    const entityInSameSequence = groupApproversBySequence(policy.approvers, policy.approvals);

    return entityInSameSequence.map((el) => {
      return {
        sequence: el.sequence ?? 1,

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
      <TableCell title={policy.name || "Unnamed Policy"}>
        {policy.name || <span className="text-muted">Unnamed Policy</span>}
      </TableCell>
      <TableCell title={environmentNames}>{environmentNames}</TableCell>
      <TableCell title={policy.secretPath || "*"}>{policy.secretPath || "*"}</TableCell>
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={variant}>
              <Icon />
              <span>{policyDetails[policy.policyType].name}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent
            align="end"
            className="max-h-96 thin-scrollbar w-64 overflow-y-auto px-3 py-2.5"
          >
            {labels && labels.length > 0 ? (
              <div className="flex flex-col gap-3">
                {labels.map((el) => (
                  <div
                    key={`approval-list-${el.sequence}`}
                    className="border-b border-foreground/10 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="mb-1.5 font-medium text-foreground">
                      {labels.length > 1 && `Step ${el.sequence} · `}
                      {el.approvals} {el.approvals === 1 ? "approval" : "approvals"} required
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                      <dt className="text-muted">Users</dt>
                      <dd className="min-w-0 text-foreground">
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
                      </dd>
                      <dt className="text-muted">Groups</dt>
                      <dd className="min-w-0 text-foreground">
                        {el.groupLabels || <span className="text-muted">None</span>}
                      </dd>
                    </dl>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted">No approvers configured.</span>
            )}
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell variant="action">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label="Options" variant="ghost" size="xs">
              <EllipsisIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent sideOffset={2} align="end" className="min-w-48 p-1">
            <DropdownMenuItem
              onClick={onEdit}
              isDisabled={!canEdit}
              title={canEdit ? undefined : (editDisabledReason ?? "Access restricted")}
            >
              <PencilIcon />
              Edit Policy
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="danger"
              onClick={onDelete}
              isDisabled={!canDelete}
              title={canDelete ? undefined : "Access restricted"}
            >
              <Trash2Icon />
              Delete Policy
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
