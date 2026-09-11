import { CONSTRAINT_LABELS, evaluateConstraints, TConstraintViolation } from "../secret-validation-rule-constraint-fns";
import { ConstraintKind, ConstraintTarget } from "../secret-validation-rule-enums";
import { TStaticSecretsRuleConfig } from "./static-secrets-rule-types";

/** Where a value that another secret already holds was found, once the service has looked it up. */
export type TDuplicateSecret = {
  key: string;
  environment: string;
  secretPath: string;
  /** Set when the writer cannot read the location, so the message has to stay vague. */
  hidden?: boolean;
};

export type TSecretToValidate = {
  key: string;
  value?: string;
  previousValues?: string[];
  duplicateOf?: TDuplicateSecret;
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

  const { duplicateOf } = secret;
  if (config.valueConstraints.reusePrevention?.otherSecrets && duplicateOf) {
    violations.push({
      kind: ConstraintKind.ReuseOtherSecrets,
      label: CONSTRAINT_LABELS[ConstraintKind.ReuseOtherSecrets],
      // Naming a secret the writer cannot read would leak where a value they do know is also used.
      message: duplicateOf.hidden
        ? "value is already used by another secret in this project"
        : `value is already used by secret "${duplicateOf.key}" in environment "${duplicateOf.environment}" at path "${duplicateOf.secretPath}"`
    });
  }

  return violations;
};
