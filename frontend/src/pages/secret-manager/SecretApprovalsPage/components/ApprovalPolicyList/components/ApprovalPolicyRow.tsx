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
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v2/Badge";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionActions } from "@app/context/ProjectPermissionContext/types";
import { getMemberLabel } from "@app/helpers/members";
import { policyDetails } from "@app/helpers/policies";
import { useToggle } from "@app/hooks";
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
  const [isExpanded, setIsExpanded] = useToggle();

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
        userLabels: members
          ?.filter((member) => el.user.find((i) => i.id === member.user.id))
          .map((member) => getMemberLabel(member))
          .join(","),
        groupLabels: groups
          ?.filter(({ group }) => el.group.find((i) => i.id === group.id))
          .map(({ group }) => group.name)
          .join(","),
        approvals: el.approvals
      };
    });
  }, [policy, members, groups]);

  return (
    <>
      <Tr
        isHoverable
        isSelectable
        role="button"
        tabIndex={0}
        onKeyDown={(evt) => {
          if (evt.key === "Enter") setIsExpanded.toggle();
        }}
        onClick={() => setIsExpanded.toggle()}
      >
        <Td>{policy.name}</Td>
        <Td>{policy.environment.slug}</Td>
        <Td>{policy.secretPath || "*"}</Td>
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
                I={ProjectPermissionActions.Edit}
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
                I={ProjectPermissionActions.Delete}
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
      {isExpanded && (
        <Tr>
          <Td colSpan={5} className="rounded bg-mineshaft-900">
            <div className="mb-4 border-b-2 border-mineshaft-500 py-2 text-lg">Approvers</div>
            {labels?.map((el, index) => (
              <div
                key={`approval-list-${index + 1}`}
                className="relative mb-2 flex rounded border border-mineshaft-500 bg-mineshaft-700 p-4"
              >
                <div>
                  <div className="mr-8 flex h-8 w-8 items-center justify-center border border-bunker-300 bg-bunker-800 text-white">
                    <div className="text-lg">{index + 1}</div>
                  </div>
                  {index !== labels.length - 1 && (
                    <div className="absolute bottom-0 left-8 h-6 border-r border-gray-400" />
                  )}
                  {index !== 0 && (
                    <div className="absolute left-8 top-0 h-4 border-r border-gray-400" />
                  )}
                </div>
                <div className="grid flex-grow grid-cols-3">
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase">Users</div>
                    <div>{el.userLabels || "-"}</div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase">Groups</div>
                    <div>{el.groupLabels || "-"}</div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase">Approvals Required</div>
                    <div>{el.approvals || "-"}</div>
                  </div>
                </div>
              </div>
            ))}
          </Td>
        </Tr>
      )}
    </>
  );
};
