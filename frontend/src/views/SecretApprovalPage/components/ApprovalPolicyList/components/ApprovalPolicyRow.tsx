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
  approvers?: string[];
  userApprovers?: { userId: string }[];
  updatedAt: Date;
  policyType: PolicyType;
  enforcementLevel: EnforcementLevel;
};

type Props = {
  policy: IPolicy;
  members?: TWorkspaceUser[];
  projectSlug: string;
  workspaceId: string;
  onEdit: () => void;
  onDelete: () => void;
};

export const ApprovalPolicyRow = ({
  policy,
  members = [],
  projectSlug,
  workspaceId,
  onEdit,
  onDelete
}: Props) => {
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>(policy.userApprovers?.map(({ userId }) => userId) || policy.approvers || []);
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
                    approvers: selectedApprovers
                  },
                  { onSettled: () => {} }
                );
              } else {
                updateSecretApprovalPolicy(
                  {
                    workspaceId,
                    id: policy.id,
                    approvers: selectedApprovers
                  },
                  { onSettled: () => {} }
                );
              }
            } else {
              setSelectedApprovers(policy.policyType === PolicyType.ChangePolicy
                ? policy?.userApprovers?.map(({ userId }) => userId) || []
                : policy?.approvers || []
              );
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
            {members?.map(({ id, user }) => {
              const userId = policy.policyType === PolicyType.ChangePolicy ? user.id : id;
              const isChecked = selectedApprovers.includes(userId);
              return (
                <DropdownMenuItem
                  onClick={(evt) => {
                    evt.preventDefault();
                    setSelectedApprovers((state) =>
                      isChecked ? state.filter((el) => el !== userId) : [...state, userId]
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
