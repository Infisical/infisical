import { useMemo } from "react";
import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v2/Badge";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionApprovalActions } from "@app/context/ProjectPermissionContext/types";
import { getMemberLabel } from "@app/helpers/members";
import { policyDetails } from "@app/helpers/policies";
import { Approver } from "@app/hooks/api/accessApproval/types";
import { TGroupMembership } from "@app/hooks/api/groups/types";
import { EnforcementLevel, PolicyType } from "@app/hooks/api/policies/enums";
import { ApproverType } from "@app/hooks/api/secretApproval/types";
import { WorkspaceEnv } from "@app/hooks/api/types";
import { TWorkspaceUser } from "@app/hooks/api/users/types";

interface IPolicy {
  id: string;
  name: string;
  environment: WorkspaceEnv;
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
    const usersInPolicy = policy.approvers
      ?.filter((approver) => approver.type === ApproverType.User)
      .map((approver) => approver.id);

    const groupsInPolicy = policy.approvers
      ?.filter((approver) => approver.type === ApproverType.Group)
      .map((approver) => approver.id);

    const memberLabels = usersInPolicy?.length
      ? members
          .filter((member) => usersInPolicy?.includes(member.user.id))
          .map((member) => getMemberLabel(member))
          .join(", ")
      : null;

    const groupLabels = groupsInPolicy?.length
      ? groups
          .filter(({ group }) => groupsInPolicy?.includes(group.id))
          .map(({ group }) => group.name)
          .join(", ")
      : null;

    return {
      members: memberLabels,
      groups: groupLabels
    };
  }, [policy, members, groups]);

  return (
    <Tr>
      <Td>{policy.name}</Td>
      <Td>{policy.environment.slug}</Td>
      <Td>{policy.secretPath || "*"}</Td>
      <Td className="max-w-0">
        <Tooltip
          side="left"
          content={labels.members ?? "No users are assigned as approvers for this policy"}
        >
          <p className="truncate">{labels.members ?? "-"}</p>
        </Tooltip>
      </Td>
      <Td className="max-w-0">
        <Tooltip
          side="left"
          content={labels.groups ?? "No groups are assigned as approvers for this policy"}
        >
          <p className="truncate">{labels.groups ?? "-"}</p>
        </Tooltip>
      </Td>
      <Td>{policy.approvals}</Td>
      <Td>
        <Badge className={policyDetails[policy.policyType].className}>
          {policyDetails[policy.policyType].name}
        </Badge>
      </Td>
      <Td>
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="cursor-pointer rounded-lg">
            <div className="flex items-center justify-center transition-transform duration-300 ease-in-out hover:scale-125 hover:text-primary-400 data-[state=open]:scale-125 data-[state=open]:text-primary-400">
              <FontAwesomeIcon size="sm" icon={faEllipsis} />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[100%] p-1">
            <ProjectPermissionCan
              I={ProjectPermissionApprovalActions.Edit}
              a={ProjectPermissionSub.SecretApproval}
            >
              {(isAllowed) => (
                <DropdownMenuItem
                  className={twMerge(
                    !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  disabled={!isAllowed}
                >
                  Edit Policy
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
            <ProjectPermissionCan
              I={ProjectPermissionApprovalActions.Delete}
              a={ProjectPermissionSub.SecretApproval}
            >
              {(isAllowed) => (
                <DropdownMenuItem
                  className={twMerge(
                    isAllowed
                      ? "hover:!bg-red-500 hover:!text-white"
                      : "pointer-events-none cursor-not-allowed opacity-50"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  disabled={!isAllowed}
                >
                  Delete Policy
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </Td>
    </Tr>
  );
};
