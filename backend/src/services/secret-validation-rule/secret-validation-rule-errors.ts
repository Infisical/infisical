import { BadRequestError } from "@app/lib/errors";

import { MAX_DESCRIBED_FAILING_SECRETS } from "./secret-validation-rule-constants";
import { TConstraintViolation } from "./secret-validation-rule-constraint-fns";

export type TCanDescribeLocation = (environment: string, secretPath: string) => boolean;

export type TSecretValidationFailure = {
  secretKey: string;
  ruleName: string;
  violation: TConstraintViolation;
};

const describeFailure = (
  { secretKey, ruleName, violation }: TSecretValidationFailure,
  canDescribeLocation?: TCanDescribeLocation
) => {
  const duplicate = violation.duplicateOf;
  const message =
    duplicate && canDescribeLocation?.(duplicate.environment, duplicate.secretPath)
      ? `value is already used by secret "${duplicate.key}" in environment "${duplicate.environment}" at path "${duplicate.secretPath}"`
      : violation.message;

  return `Secret "${secretKey}": ${message} (rule: "${ruleName}", constraint: ${violation.label})`;
};

export const describeSecretValidationFailures = (
  failures: TSecretValidationFailure[],
  canDescribeLocation?: TCanDescribeLocation
) => {
  // capped by secret rather than by failure, so every failure of a secret that is listed stays visible
  const failingKeys = [...new Set(failures.map((failure) => failure.secretKey))];
  const describedKeys = new Set(failingKeys.slice(0, MAX_DESCRIBED_FAILING_SECRETS));
  const described = failures
    .filter((failure) => describedKeys.has(failure.secretKey))
    .map((failure) => describeFailure(failure, canDescribeLocation));

  const remaining = failingKeys.length - describedKeys.size;
  if (remaining > 0) {
    described.push(`...and ${remaining} more ${remaining === 1 ? "secret" : "secrets"} failed validation`);
  }

  return `Secret validation failed:\n${described.join("\n\n")}`;
};

export class SecretValidationError extends BadRequestError {
  readonly failures: TSecretValidationFailure[];

  constructor(failures: TSecretValidationFailure[]) {
    super({ message: describeSecretValidationFailures(failures) });
    this.failures = failures;
  }
}
