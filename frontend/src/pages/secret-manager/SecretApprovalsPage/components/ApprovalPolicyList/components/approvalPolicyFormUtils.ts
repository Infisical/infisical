import { getMemberLabel } from "@app/helpers/members";
import { ApproverType, BypasserType } from "@app/hooks/api/accessApproval/types";
import { TGroupMembership } from "@app/hooks/api/groups/types";
import { TWorkspaceUser } from "@app/hooks/api/users/types";

import { ApproverOptionData } from "./ApproverOption";

type TApprovalStep = {
  user: unknown[];
  group: unknown[];
};

export const getApproverOptionLabel = (
  option: ApproverOptionData,
  members: TWorkspaceUser[] = [],
  groups: TGroupMembership[] = []
) => {
  if (option.type === ApproverType.Group || option.type === BypasserType.Group) {
    const groupName = groups.find(({ group }) => group.id === option.id)?.group.name;
    return groupName ?? option.name ?? option.id ?? "Unknown approver";
  }

  const member = members.find((workspaceUser) => workspaceUser.user.id === option.id);
  if (member) return getMemberLabel(member);

  return option.name ?? option.username ?? option.id ?? "Unknown approver";
};

export const getEmptyApprovalStepIndexes = (steps: TApprovalStep[] = []) =>
  steps.reduce<number[]>((emptyStepIndexes, step, index) => {
    if (!(step.user.length || step.group.length)) emptyStepIndexes.push(index);
    return emptyStepIndexes;
  }, []);
