import { useState } from "react";
import { faCheckCircle, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Input,
  Td,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v2/Badge";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { policyDetails } from "@app/helpers/policies";
import { useUpdateAccessApprovalPolicy, useUpdateSecretApprovalPolicy } from "@app/hooks/api";
import { Approver, ApproverType } from "@app/hooks/api/accessApproval/types";
import { TGroupMembership } from "@app/hooks/api/groups/types";
import { EnforcementLevel, PolicyType } from "@app/hooks/api/policies/enums";
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
};

type Props = {
  policy: IPolicy;
  members?: TWorkspaceUser[];
  groups?: TGroupMembership[];
  projectSlug: string;
  workspaceId: string;
  onEdit: () => void;
  onDelete: () => void;
};

export const ApprovalPolicyRow = ({
  policy,
  members = [],
  groups = [],
  projectSlug,
  workspaceId,
  onEdit,
  onDelete
}: Props) => {
  const [selectedApprovers, setSelectedApprovers] = useState<Approver[]>(policy.approvers?.filter((approver) => approver.type === ApproverType.User) || []);
  const [selectedGroupApprovers, setSelectedGroupApprovers] = useState<Approver[]>(policy.approvers?.filter((approver) => approver.type === ApproverType.Group) || []);
  const { mutate: updateAccessApprovalPolicy, isLoading: isAccessApprovalPolicyLoading } = useUpdateAccessApprovalPolicy();
  const { mutate: updateSecretApprovalPolicy, isLoading: isSecretApprovalPolicyLoading } = useUpdateSecretApprovalPolicy();
  const isLoading = isAccessApprovalPolicyLoading || isSecretApprovalPolicyLoading;

  const { permission } = useProjectPermission();

  return (
    <Tr>
      <Td>{policy.name}</Td>
      <Td>{policy.environment.slug}</Td>
      <Td>{policy.secretPath || "*"}</Td>
      <Td>
        <DropdownMenu
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              if (policy.policyType === PolicyType.AccessPolicy) {
                updateAccessApprovalPolicy(
                  {
                    projectSlug,
                    id: policy.id,
                    approvers: selectedApprovers.concat(selectedGroupApprovers),
                  },
                  {
                    onError: () => {
                      setSelectedApprovers(policy?.approvers?.filter((approver) => approver.type === ApproverType.User) || []);
                    }
                  }
                );
              } else {
                updateSecretApprovalPolicy(
                  {
                    workspaceId,
                    id: policy.id,
                    approvers: selectedApprovers.concat(selectedGroupApprovers),
                  },
                  {
                    onError: () => {
                      setSelectedApprovers(policy?.approvers?.filter((approver) => approver.type === ApproverType.User) || []);
                    }
                  }
                );
              }
            } else {
              setSelectedApprovers(policy?.approvers?.filter((approver) => approver.type === ApproverType.User) || []);
            }
          }}
        >
          <DropdownMenuTrigger
            asChild
            disabled={
              isLoading ||
              permission.cannot(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretApproval)
            }
          >
            <Input
              isReadOnly
              value={selectedApprovers.length ? `${selectedApprovers.length} selected` : "None"}
              className="text-left"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            style={{ width: "var(--radix-dropdown-menu-trigger-width)" }}
            align="start"
          >
            <DropdownMenuLabel>
              Select members that are allowed to approve changes
            </DropdownMenuLabel>
            {members?.map(({ user }) => {
              const userId = user.id;
              const isChecked = selectedApprovers?.filter((el: { id: string, type: ApproverType }) => el.id === userId && el.type === ApproverType.User).length > 0;
              return (
                <DropdownMenuItem
                  onClick={(evt) => {
                    evt.preventDefault();
                    setSelectedApprovers((state) =>
                      isChecked ? state.filter((el) => el.id !== userId || el.type !== ApproverType.User) : [...state, { id: userId, type: ApproverType.User }]
                    );
                  }}
                  key={`create-policy-members-${userId}`}
                  iconPos="right"
                  icon={isChecked && <FontAwesomeIcon icon={faCheckCircle} />}
                >
                  {user.username}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </Td>
      <Td>
        <DropdownMenu
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              if (policy.policyType === PolicyType.AccessPolicy) {
                updateAccessApprovalPolicy(
                  {
                    projectSlug,
                    id: policy.id,
                    approvers: selectedApprovers.concat(selectedGroupApprovers),
                  },
                  {
                    onError: () => {
                      setSelectedGroupApprovers(policy?.approvers?.filter((approver) => approver.type === ApproverType.Group) || []);
                    }
                  },
                );
              } else {
                updateSecretApprovalPolicy(
                  {
                    workspaceId,
                    id: policy.id,
                    approvers: selectedApprovers.concat(selectedGroupApprovers),
                  },
                  {
                    onError: () => {
                      setSelectedGroupApprovers(policy?.approvers?.filter((approver) => approver.type === ApproverType.Group) || []);
                    }
                  }
                );
              }
            } else {
              setSelectedGroupApprovers(policy?.approvers?.filter((approver) => approver.type === ApproverType.Group) || []);
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <Input
              isReadOnly
              value={selectedGroupApprovers?.length ? `${selectedGroupApprovers.length} selected` : "None"}
              className="text-left"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            style={{ width: "var(--radix-dropdown-menu-trigger-width)" }}
            align="start"
          >
            <DropdownMenuLabel>
              Select groups that are allowed to approve requests
            </DropdownMenuLabel>
            {groups && groups.map(({ group }) => {
              const { id } = group;
              const isChecked = selectedGroupApprovers?.filter((el: { id: string, type: ApproverType }) => el.id === id && el.type === ApproverType.Group).length > 0;
              return (
                <DropdownMenuItem
                  onClick={(evt) => {
                    evt.preventDefault();
                    setSelectedGroupApprovers(
                      isChecked
                        ? selectedGroupApprovers?.filter((el) => el.id !== id || el.type !== ApproverType.Group)
                        : [...(selectedGroupApprovers || []), { id, type: ApproverType.Group }]
                    );
                  }}
                  key={`create-policy-groups-${id}`}
                  iconPos="right"
                  icon={isChecked && <FontAwesomeIcon icon={faCheckCircle} />}
                >
                  {group.name}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </Td>
      <Td>{policy.approvals}</Td>
      <Td>
        <Badge className={policyDetails[policy.policyType].className}>
          {policyDetails[policy.policyType].name}
        </Badge>
      </Td>
      <Td>
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="rounded-lg cursor-pointer">
            <div className="flex justify-center items-center hover:text-primary-400 data-[state=open]:text-primary-400 hover:scale-125 data-[state=open]:scale-125 transition-transform duration-300 ease-in-out">
              <FontAwesomeIcon size="sm" icon={faEllipsis} />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="p-1 min-w-[100%]">
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
  );
};
