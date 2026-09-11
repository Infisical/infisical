import RE2 from "re2";

import { ConstraintKind, ConstraintTarget } from "./secret-validation-rule-enums";
import { CONSTRAINT_TARGET_LABELS } from "./secret-validation-rule-maps";
import { TConstraints } from "./secret-validation-rule-schemas";

export const CONSTRAINT_LABELS: Record<ConstraintKind, string> = {
  [ConstraintKind.MinLength]: "Minimum length",
  [ConstraintKind.MaxLength]: "Maximum length",
  [ConstraintKind.RegexPattern]: "Regex pattern",
  [ConstraintKind.RequiredPrefix]: "Required prefix",
  [ConstraintKind.RequiredSuffix]: "Required suffix",
  [ConstraintKind.ReusePreviousVersions]: "Prevent reuse of previous secret values",
  [ConstraintKind.ReuseOtherSecrets]: "Prevent reuse of a value another secret already holds"
};

export type TConstraintViolation = {
  kind: ConstraintKind;
  label: string;
  message: string;
};

const violation = (kind: ConstraintKind, message: string): TConstraintViolation => ({
  kind,
  label: CONSTRAINT_LABELS[kind],
  message
});

export const evaluateConstraints = ({
  constraints,
  target,
  value
}: {
  constraints: TConstraints;
  target: ConstraintTarget;
  value: string;
}): TConstraintViolation[] => {
  const { minLength, maxLength, regexPattern, requiredPrefix, requiredSuffix } = constraints;
  const label = CONSTRAINT_TARGET_LABELS[target];
  const violations: TConstraintViolation[] = [];

  if (minLength !== undefined && value.length < minLength) {
    violations.push(
      violation(ConstraintKind.MinLength, `${label} must be at least ${minLength} characters (got ${value.length})`)
    );
  }

  if (maxLength !== undefined && value.length > maxLength) {
    violations.push(
      violation(ConstraintKind.MaxLength, `${label} must be at most ${maxLength} characters (got ${value.length})`)
    );
  }

  if (regexPattern !== undefined && !new RE2(regexPattern).test(value)) {
    violations.push(violation(ConstraintKind.RegexPattern, `${label} must match pattern ${regexPattern}`));
  }

  if (requiredPrefix !== undefined && !value.startsWith(requiredPrefix)) {
    violations.push(violation(ConstraintKind.RequiredPrefix, `${label} must start with "${requiredPrefix}"`));
  }

  if (requiredSuffix !== undefined && !value.endsWith(requiredSuffix)) {
    violations.push(violation(ConstraintKind.RequiredSuffix, `${label} must end with "${requiredSuffix}"`));
  }

  return violations;
};

// combine the constraints of every rule covering the same generated credential. lengths take the strictest bound; the remaining fields can only come from one rule
// two rules setting the same field in overlapping scope are rejected when the second is saved
export const mergeConstraints = (constraintSets: TConstraints[]): TConstraints =>
  constraintSets.reduce<TConstraints>((merged, constraints) => {
    const { minLength, maxLength, regexPattern, requiredPrefix, requiredSuffix } = constraints;

    return {
      minLength: minLength === undefined ? merged.minLength : Math.max(minLength, merged.minLength ?? minLength),
      maxLength: maxLength === undefined ? merged.maxLength : Math.min(maxLength, merged.maxLength ?? maxLength),
      regexPattern: regexPattern ?? merged.regexPattern,
      requiredPrefix: requiredPrefix ?? merged.requiredPrefix,
      requiredSuffix: requiredSuffix ?? merged.requiredSuffix
    };
  }, {});

const namedFields = (path: string, value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (typeof value !== "object") return [path];
  return Object.entries(value).flatMap(([field, nested]) => namedFields(`${path}.${field}`, nested));
};

export const listSetConstraintFields = (constraintsByTarget: Record<string, TConstraints | null | undefined>) =>
  new Set(Object.entries(constraintsByTarget).flatMap(([target, constraints]) => namedFields(target, constraints)));
