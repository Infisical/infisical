import { anyOf } from "./auto-approval-fns";
import {
  AUTO_APPROVAL_REQUESTER_GROUP_CONSTRAINT,
  AUTO_APPROVAL_REQUESTER_SUBJECT,
  AUTO_APPROVAL_REQUESTER_USER_CONSTRAINT,
  AutoApprovalConstraintValue,
  TAutoApprovalSubject
} from "./auto-approval-types";

export type TRequesterCheckFacts = {
  userId: string;
  // The requester's groups among the ones the checks name
  groupIds: string[];
  // Names of the users and groups the checks name, so descriptions and reasons don't show IDs
  names: Record<string, string>;
};

const nameValues = (facts: TRequesterCheckFacts, values: string[]) =>
  values.map((value) => facts.names[value] ?? value);

export const REQUESTER_CHECKS: Pick<
  TAutoApprovalSubject<null, TRequesterCheckFacts>,
  "label" | "input" | "constraints"
> = {
  label: "Requester",
  input: null,
  constraints: {
    [AUTO_APPROVAL_REQUESTER_USER_CONSTRAINT]: {
      label: "is",
      value: AutoApprovalConstraintValue.Many,
      test: (facts, values) =>
        values.includes(facts.userId)
          ? { pass: true }
          : { pass: false, reason: `The requester isn't ${anyOf(nameValues(facts, values))}` },
      describeValues: nameValues
    },
    [AUTO_APPROVAL_REQUESTER_GROUP_CONSTRAINT]: {
      label: "is a member of",
      value: AutoApprovalConstraintValue.Many,
      test: (facts, values) =>
        values.some((value) => facts.groupIds.includes(value))
          ? { pass: true }
          : { pass: false, reason: `The requester isn't a member of ${anyOf(nameValues(facts, values))}` },
      describeValues: nameValues
    }
  }
};

// A requester condition with a connection reads the requester's account in that service instead
export const isRequesterCheck = (condition: { subject: string; connectionId?: string | null }) =>
  condition.subject === AUTO_APPROVAL_REQUESTER_SUBJECT && !condition.connectionId;
