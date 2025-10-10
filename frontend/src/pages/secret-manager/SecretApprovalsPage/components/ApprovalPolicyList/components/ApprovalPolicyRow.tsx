import { useMemo } from "react";
import {
  faBan,
  faClipboardCheck,
  faEdit,
  faEllipsisV,
  faTrash,
  faUser,
  faUserGroup
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GenericFieldLabel,
  IconButton,
  Td,
  Tooltip,
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

        users: members.filter((member) => el.user.find((i) => i.id === member.user.id)),

        groupLabels: groups
          ?.filter(({ group }) => el.group.find((i) => i.id === group.id))
          .map(({ group }) => group.name)
          .join(", "),
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
        <Td>{policy.name || <span className="text-mineshaft-400">Unnamed Policy</span>}</Td>
        <Td>{policy.environments.map((env) => env.name).join(", ")}</Td>
        <Td>{policy.secretPath || "*"}</Td>
        <Td>
          <Badge
            className={twMerge(
              policyDetails[policy.policyType].className,
              "flex w-min items-center gap-1.5 whitespace-nowrap"
            )}
          >
            <FontAwesomeIcon icon={policyDetails[policy.policyType].icon} />
            <span>{policyDetails[policy.policyType].name}</span>
          </Badge>
        </Td>
        <Td>
          <DropdownMenu>
            <DropdownMenuTrigger asChild className="cursor-pointer rounded-lg">
              <DropdownMenuTrigger asChild>
                <IconButton
                  ariaLabel="Options"
                  colorSchema="secondary"
                  className="w-6"
                  variant="plain"
                >
                  <FontAwesomeIcon icon={faEllipsisV} />
                </IconButton>
              </DropdownMenuTrigger>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={2} align="end" className="min-w-48 p-1">
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.SecretApproval}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={faEdit} />}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={faTrash} />}
                  >
                    Delete Policy
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </Td>
      </Tr>
      <Tr>
        <Td colSpan={6} className="border-none! p-0">
          <div
            className={`w-full overflow-hidden bg-mineshaft-900/75 transition-all duration-500 ease-in-out ${
              isExpanded ? "max-h-104 thin-scrollbar overflow-y-auto! opacity-100" : "max-h-0"
            }`}
          >
            <div className="p-4">
              <div className="border-b-2 border-mineshaft-500 pb-2">Approvers</div>
              {labels?.map((el, index) => (
                <div key={`approval-list-${index + 1}`} className="flex">
                  {labels.length > 1 && (
                    <div className="flex w-12 flex-col items-center gap-2 pr-4">
                      <div
                        className={twMerge("grow border-mineshaft-600", index !== 0 && "border-r")}
                      />
                      {labels.length > 1 && (
                        <Badge className="my-auto flex h-5 w-min min-w-5 items-center justify-center gap-1.5 bg-mineshaft-400/50 text-center whitespace-nowrap text-bunker-200">
                          <span>{index + 1}</span>
                        </Badge>
                      )}
                      <div
                        className={twMerge(
                          "grow border-mineshaft-600",
                          index < labels.length - 1 && "border-r"
                        )}
                      />
                    </div>
                  )}
                  <div className="grid flex-1 grid-cols-5 border-b border-mineshaft-600 p-4">
                    <GenericFieldLabel className="col-span-2" icon={faUser} label="Users">
                      {Boolean(el.users.length) && (
                        <div className="flex flex-row flex-wrap gap-2">
                          {el.users.map((u, idx) => {
                            return u.user.isOrgMembershipActive ? (
                              <div className="flex items-center" key={u.id}>
                                <span>{getMemberLabel(u)}</span>
                                {idx < el.users.length - 1 && ","}
                              </div>
                            ) : (
                              <div className="flex items-center" key={u.id}>
                                <span className="flex items-center opacity-40">
                                  {getMemberLabel(u)}
                                  <span className="text-xs">
                                    <Tooltip content="This user has been deactivated and no longer has an active organization membership.">
                                      <div>
                                        <Badge className="pointer-events-none mr-auto ml-1 flex h-5 w-min items-center gap-1.5 bg-mineshaft-400/50 whitespace-nowrap text-bunker-300">
                                          <FontAwesomeIcon icon={faBan} />
                                          Inactive
                                        </Badge>
                                      </div>
                                    </Tooltip>
                                  </span>
                                </span>
                                {idx < el.users.length - 1 && ","}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </GenericFieldLabel>
                    <GenericFieldLabel className="col-span-2" icon={faUserGroup} label="Groups">
                      {el.groupLabels}
                    </GenericFieldLabel>
                    <GenericFieldLabel icon={faClipboardCheck} label="Approvals Required">
                      {el.approvals}
                    </GenericFieldLabel>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Td>
      </Tr>
    </>
  );
};
