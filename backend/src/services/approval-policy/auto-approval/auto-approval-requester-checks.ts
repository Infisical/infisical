import { isUuidV4 } from "@app/lib/validator";
import { ApproverType } from "@app/services/approval-policy/approval-policy-enums";

import { anyOf } from "./auto-approval-fns";
import {
  AUTO_APPROVAL_REQUESTER_CONSTRAINT,
  AUTO_APPROVAL_REQUESTER_SUBJECT,
  AutoApprovalConstraintValue,
  TAutoApprovalSubject
} from "./auto-approval-types";

export type TRequesterCheckFacts = {
  userId: string;
  // The requester's groups among the ones the checks name
  groupIds: string[];
  // Names of the users and groups the checks name, by value, so descriptions and reasons don't show IDs
  names: Record<string, string>;
};

// A value names a user as `user:<id>` or a group as `group:<id>`, typed the way approvers are
export const toRequesterCheckValue = (type: ApproverType, id: string) => `${type}:${id}`;

export const parseRequesterCheckValue = (value: string) => {
  const type = Object.values(ApproverType).find((candidate) => value.startsWith(`${candidate}:`));
  const id = type ? value.slice(type.length + 1) : "";
  return type && isUuidV4(id) ? { type, id } : null;
};

const describeValues = (facts: TRequesterCheckFacts, values: string[]) => {
  const nameOf = (value: string) => facts.names[value] ?? value;
  const groups = values.filter((value) => value.startsWith(`${ApproverType.Group}:`));
  return [
    ...values.filter((value) => !groups.includes(value)).map(nameOf),
    ...(groups.length ? [`a member of ${anyOf(groups.map(nameOf))}`] : [])
  ];
};

export const REQUESTER_CHECKS: Pick<
  TAutoApprovalSubject<null, TRequesterCheckFacts>,
  "label" | "input" | "constraints"
> = {
  label: "Requester",
  input: null,
  constraints: {
    [AUTO_APPROVAL_REQUESTER_CONSTRAINT]: {
      label: "is",
      value: AutoApprovalConstraintValue.Many,
      test: (facts, values) =>
        [
          toRequesterCheckValue(ApproverType.User, facts.userId),
          ...facts.groupIds.map((groupId) => toRequesterCheckValue(ApproverType.Group, groupId))
        ].some((value) => values.includes(value))
          ? { pass: true }
          : { pass: false, reason: `The requester isn't ${anyOf(describeValues(facts, values))}` },
      describeValues
    }
  }
};

// A requester condition with a connection reads the requester's account in that service instead
export const isRequesterCheck = (condition: { subject: string; connectionId?: string | null }) =>
  condition.subject === AUTO_APPROVAL_REQUESTER_SUBJECT && !condition.connectionId;
