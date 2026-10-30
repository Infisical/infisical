import type { Scope } from "../model";
import type { PermissionSubject } from "./catalog";
import { CONDITION_OPTIONS } from "./conditions";
import { actionLabel, type Condition, type Rule } from "./permissions-model";

const FALLBACK_LABELS: Record<string, string> = {
  environment: "environment",
  secretPath: "secret path"
};

const lhsLabel = (subject: string, lhs: string) =>
  (
    CONDITION_OPTIONS[subject]?.find((option) => option.value === lhs)?.label ??
    FALLBACK_LABELS[lhs] ??
    lhs
  ).toLowerCase();

const OPERATOR_WORDS: Record<string, string> = {
  $eq: "is",
  $neq: "is not",
  $glob: "matches",
  $in: "is one of",
  $all: "contains all"
};

export const conditionText = (subject: string, condition: Condition) => {
  const word =
    condition.lhs === "secretTags" && condition.operator === "$in"
      ? "contains"
      : (OPERATOR_WORDS[condition.operator] ?? condition.operator);
  return `${lhsLabel(subject, condition.lhs)} ${word} ${condition.rhs || "(empty)"}`;
};

export const conditionsText = (subject: string, conditions: readonly Condition[]) =>
  conditions.map((condition) => conditionText(subject, condition)).join(" and ");

export const actionsText = (scope: Scope, subject: string, actions: readonly string[]) =>
  actions.map((action) => actionLabel(scope, subject, action)).join(", ");

export type SubjectState = {
  ruleCount: number;
  simple: boolean;
  allowed: readonly string[];
  conditional: boolean;
  forbid: boolean;
};

export const subjectState = (rules: readonly Rule[] | undefined): SubjectState => {
  const list = rules ?? [];
  const conditional = list.some((rule) => rule.conditions.length > 0);
  const forbid = list.some((rule) => rule.inverted);
  const simple = list.length <= 1 && !conditional && !forbid;
  return {
    ruleCount: list.length,
    simple,
    allowed: simple ? (list[0]?.actions ?? []) : [],
    conditional,
    forbid
  };
};

export type Verb = "view" | "create" | "edit" | "delete" | "other";
export const VERBS: { id: Verb; label: string }[] = [
  { id: "view", label: "View" },
  { id: "create", label: "Create" },
  { id: "edit", label: "Edit" },
  { id: "delete", label: "Delete" },
  { id: "other", label: "Other" }
];

export const verbOf = (action: string): Verb => {
  if (/^(read|describe|list|view)/i.test(action)) return "view";
  if (/^create/i.test(action)) return "create";
  if (/^edit/i.test(action)) return "edit";
  if (/^delete/i.test(action)) return "delete";
  return "other";
};

export const matrixActions = (config: PermissionSubject) =>
  config.actions.filter(
    (action) =>
      !(config.subject === "secrets" && action.value === "read") &&
      action.value !== "grant-privileges"
  );
