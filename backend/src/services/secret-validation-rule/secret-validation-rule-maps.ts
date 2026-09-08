import { ConstraintTarget, SecretValidationRuleType } from "./secret-validation-rule-enums";

export const SECRET_VALIDATION_RULE_NAME_MAP = {
  [SecretValidationRuleType.StaticSecrets]: "Static Secrets",
  [SecretValidationRuleType.DynamicSecrets]: "Dynamic Secrets",
  [SecretValidationRuleType.SecretRotations]: "Secret Rotations"
} as const satisfies Record<SecretValidationRuleType, string>;

// how a target is named inside a violation message shown to whoever made the write
export const CONSTRAINT_TARGET_LABELS: Record<ConstraintTarget, string> = {
  [ConstraintTarget.SecretKey]: "key",
  [ConstraintTarget.SecretValue]: "value",
  [ConstraintTarget.GeneratedPassword]: "password"
};

// how a target is named in the API reference, where there is no surrounding context to lean on
export const CONSTRAINT_TARGET_DOC_LABELS: Record<ConstraintTarget, string> = {
  [ConstraintTarget.SecretKey]: "secret key",
  [ConstraintTarget.SecretValue]: "secret value",
  [ConstraintTarget.GeneratedPassword]: "generated password"
};
