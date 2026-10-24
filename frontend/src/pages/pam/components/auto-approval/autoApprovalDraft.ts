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

// The API's limits, checked here so an over-limit config is flagged beside its control instead of failing on save
export const AUTO_APPROVAL_LIMITS = {
  inputs: 10,
  rules: 20,
  conditions: 20,
  values: 50,
  valueLength: 255
};

// Mirrors the Jira provider's constraint; other providers name theirs the same way
export const ASSIGNED_TO_REQUESTER_CONSTRAINT = "assigned-to-requester";

// Mirrors the reuse check the engine adds to every record a requester links
export const UNUSED_CONSTRAINT = "not-used-before";

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

// Fields from two connections of the same app share a label, so the connection name tells them apart
export const getSubjectDisplayLabel = (
  inputs: TAutoApprovalDraft["inputs"],
  catalog: TAutoApprovalCatalogConnection[] | undefined,
  connectionId: string,
  subjectId: string
) => {
  const { connection, subject } = findSubject(catalog, connectionId, subjectId);
  if (!subject) return null;
  const isShared = inputs.some(
    (input) =>
      (input.connectionId !== connectionId || input.subject !== subjectId) &&
      findSubject(catalog, input.connectionId, input.subject).subject?.label === subject.label
  );
  return isShared && connection ? `${subject.label} from ${connection.name}` : subject.label;
};

export const isRequesterSubject = (subjectId: string) =>
  subjectId === AUTO_APPROVAL_REQUESTER_SUBJECT;

export const getConditionError = (
  condition: TDraftCondition,
  catalog: TAutoApprovalCatalogConnection[] | undefined
): string | null => {
  if (!condition.connectionId || !condition.subject) return "Choose what to check";
  if (!condition.constraint) return "Choose a check";
  if (condition.values.length > AUTO_APPROVAL_LIMITS.values) {
    return `Choose at most ${AUTO_APPROVAL_LIMITS.values} values`;
  }
  if (condition.values.some((value) => value.length > AUTO_APPROVAL_LIMITS.valueLength)) {
    return `Values can be at most ${AUTO_APPROVAL_LIMITS.valueLength} characters`;
  }

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

export const getRuleError = (rule: TDraftRule): string | null => {
  if (!rule.name.trim()) return "Name this rule";
  if (rule.conditions.length === 0) return "Add at least one condition";
  if (rule.conditions.length > AUTO_APPROVAL_LIMITS.conditions) {
    return `A rule can have at most ${AUTO_APPROVAL_LIMITS.conditions} conditions`;
  }
  return null;
};

export const isRuleComplete = (
  rule: TDraftRule,
  catalog: TAutoApprovalCatalogConnection[] | undefined
) =>
  !getRuleError(rule) &&
  !rule.conditions.some((condition) => getConditionError(condition, catalog));

// The rule checks a record without this check, like an assignee check or the reuse check
export const getSubjectsMissingCheck = (
  rule: TDraftRule,
  catalog: TAutoApprovalCatalogConnection[] | undefined,
  constraintId: string
) => {
  const linked = new Map<string, TDraftCondition>();
  rule.conditions
    .filter((condition) => condition.subject && !isRequesterSubject(condition.subject))
    .forEach((condition) =>
      linked.set(`${condition.connectionId}:${condition.subject}`, condition)
    );

  return [...linked.values()].filter((condition) => {
    const { subject } = findSubject(catalog, condition.connectionId, condition.subject);
    const offersCheck = subject?.constraints.some((constraint) => constraint.id === constraintId);
    return (
      offersCheck &&
      !rule.conditions.some(
        (other) =>
          other.connectionId === condition.connectionId &&
          other.subject === condition.subject &&
          other.constraint === constraintId
      )
    );
  });
};

// A rule checks one connection per kind of record, so its conditions on the same field kind share a connection
export const getRecordKind = (
  catalog: TAutoApprovalCatalogConnection[] | undefined,
  connectionId: string,
  subjectId: string
) => `${findSubject(catalog, connectionId, subjectId).connection?.app}:${subjectId}`;

// A new rule starts single use and bound to the requester for each kind of record the folder asks for
export const getDefaultRuleConditions = (
  inputs: TAutoApprovalDraft["inputs"],
  catalog: TAutoApprovalCatalogConnection[] | undefined
): TDraftCondition[] => {
  const seenKinds = new Set<string>();
  return inputs.flatMap(({ connectionId, subject: subjectId }) => {
    const kind = getRecordKind(catalog, connectionId, subjectId);
    if (seenKinds.has(kind)) return [];
    seenKinds.add(kind);

    const { subject } = findSubject(catalog, connectionId, subjectId);
    return [UNUSED_CONSTRAINT, ASSIGNED_TO_REQUESTER_CONSTRAINT]
      .filter((constraintId) =>
        subject?.constraints.some((constraint) => constraint.id === constraintId)
      )
      .map((constraint) => ({
        key: newKey(),
        connectionId,
        subject: subjectId,
        constraint,
        values: []
      }));
  });
};
