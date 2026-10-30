import type { Scope } from "../model";
import { CONDITION_OPTIONS } from "./conditions";
import { actionLabel, type Condition } from "./permissions-model";

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

const conditionText = (subject: string, condition: Condition) => {
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
