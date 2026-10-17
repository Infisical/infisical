import {
  AUTO_APPROVAL_REQUESTER_SUBJECT,
  AutoApprovalConstraintValue,
  TAutoApprovalCatalogConnection,
  TAutoApprovalCatalogSubject,
  TAutoApprovalConfig,
  TAutoApprovalConfigResponse
} from "@app/hooks/api/approvalPolicies";

// Client keys keep React rows stable while rules and conditions are edited
export type TDraftCondition = {
  key: string;
  connectionId: string;
  subject: string;
  constraint: string;
  values: string[];
};

export type TDraftRule = { key: string; name: string; conditions: TDraftCondition[] };

export type TAutoApprovalDraft = {
  inputs: { connectionId: string; subject: string }[];
  rules: TDraftRule[];
};

// Mirrors the Jira provider's constraint; other providers name theirs the same way
export const ASSIGNED_TO_REQUESTER_CONSTRAINT = "assigned-to-requester";

export const newKey = () => crypto.randomUUID();

export const EMPTY_AUTO_APPROVAL_DRAFT: TAutoApprovalDraft = { inputs: [], rules: [] };

export const toAutoApprovalDraft = (config?: TAutoApprovalConfigResponse): TAutoApprovalDraft => ({
  inputs: (config?.inputs ?? []).map(({ connectionId, subject }) => ({ connectionId, subject })),
  rules: (config?.rules ?? []).map((rule) => ({
    key: rule.id,
    name: rule.name,
    conditions: rule.conditions.map((condition) => ({
      key: condition.id,
      connectionId: condition.connectionId,
      subject: condition.subject,
      constraint: condition.constraint,
      values: condition.values
    }))
  }))
});

export const toAutoApprovalConfig = (draft: TAutoApprovalDraft): TAutoApprovalConfig => ({
  inputs: draft.inputs,
  rules: draft.rules.map((rule) => ({
    name: rule.name.trim(),
    conditions: rule.conditions.map(({ connectionId, subject, constraint, values }) => ({
      connectionId,
      subject,
      constraint,
      values
    }))
  }))
});

// Compared without client keys, so reordering keys alone never reads as a change
export const serializeAutoApprovalDraft = (draft: TAutoApprovalDraft) =>
  JSON.stringify(toAutoApprovalConfig(draft));

export const findSubject = (
  catalog: TAutoApprovalCatalogConnection[] | undefined,
  connectionId: string,
  subjectId: string
): { connection?: TAutoApprovalCatalogConnection; subject?: TAutoApprovalCatalogSubject } => {
  const connection = catalog?.find((candidate) => candidate.id === connectionId);
  return {
    connection,
    subject: connection?.subjects.find((candidate) => candidate.id === subjectId)
  };
};

export const isRequesterSubject = (subjectId: string) =>
  subjectId === AUTO_APPROVAL_REQUESTER_SUBJECT;

export const getConditionError = (
  condition: TDraftCondition,
  catalog: TAutoApprovalCatalogConnection[] | undefined
): string | null => {
  if (!condition.connectionId || !condition.subject) return "Choose what to check";
  if (!condition.constraint) return "Choose a check";

  const constraint = findSubject(
    catalog,
    condition.connectionId,
    condition.subject
  ).subject?.constraints.find((candidate) => candidate.id === condition.constraint);
  if (!constraint) return null;
  if (constraint.value === AutoApprovalConstraintValue.One && condition.values.length !== 1) {
    return "Choose a value";
  }
  if (constraint.value === AutoApprovalConstraintValue.Many && condition.values.length === 0) {
    return "Choose at least one value";
  }
  return null;
};

export const getRuleError = (
  rule: TDraftRule,
  catalog: TAutoApprovalCatalogConnection[] | undefined
): string | null => {
  if (!rule.name.trim()) return "Name this rule";
  if (rule.conditions.length === 0) {
    return "Add at least one condition, or this rule would approve every request";
  }
  return rule.conditions.some((condition) => getConditionError(condition, catalog))
    ? "Finish every condition"
    : null;
};

// A ticket condition without an assignee check lets anyone link someone else's approved ticket
export const getUnboundInputSubjects = (
  rule: TDraftRule,
  catalog: TAutoApprovalCatalogConnection[] | undefined
) => {
  const linked = new Map<string, TDraftCondition>();
  rule.conditions
    .filter((condition) => condition.subject && !isRequesterSubject(condition.subject))
    .forEach((condition) =>
      linked.set(`${condition.connectionId}:${condition.subject}`, condition)
    );

  return [...linked.values()].filter((condition) => {
    const { subject } = findSubject(catalog, condition.connectionId, condition.subject);
    const offersAssigneeCheck = subject?.constraints.some(
      (constraint) => constraint.id === ASSIGNED_TO_REQUESTER_CONSTRAINT
    );
    return (
      offersAssigneeCheck &&
      !rule.conditions.some(
        (other) =>
          other.connectionId === condition.connectionId &&
          other.subject === condition.subject &&
          other.constraint === ASSIGNED_TO_REQUESTER_CONSTRAINT
      )
    );
  });
};
