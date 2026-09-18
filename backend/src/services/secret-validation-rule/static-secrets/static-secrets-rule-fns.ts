import { CONSTRAINT_LABELS, evaluateConstraints, TConstraintViolation } from "../secret-validation-rule-constraint-fns";
import { ConstraintKind, ConstraintTarget } from "../secret-validation-rule-enums";
import { TStaticSecretsRuleConfig } from "./static-secrets-rule-types";

export type TSecretToValidate = {
  key: string;
  value?: string;
  previousValues?: string[];
};

export const evaluateStaticSecretConstraints = (
  config: TStaticSecretsRuleConfig,
  secret: TSecretToValidate
): TConstraintViolation[] => {
  const violations = config.keyConstraints
    ? evaluateConstraints({
        constraints: config.keyConstraints,
        target: ConstraintTarget.SecretKey,
        value: secret.key
      })
    : [];

  // A key-only rename carries no value, so there is nothing to hold the value constraints against.
  if (!config.valueConstraints || secret.value === undefined) return violations;

  violations.push(
    ...evaluateConstraints({
      constraints: config.valueConstraints,
      target: ConstraintTarget.SecretValue,
      value: secret.value
    })
  );

  const versionCount = config.valueConstraints.reusePrevention?.previousVersions;
  if (versionCount !== undefined && secret.previousValues?.slice(0, versionCount).includes(secret.value)) {
    violations.push({
      kind: ConstraintKind.ReusePreviousVersions,
      label: CONSTRAINT_LABELS[ConstraintKind.ReusePreviousVersions],
      message: `value cannot reuse any of the last ${versionCount} values`
    });
  }

  return violations;
};
