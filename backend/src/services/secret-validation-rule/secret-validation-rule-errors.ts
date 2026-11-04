import { BadRequestError } from "@app/lib/errors";

import { TConstraintViolation } from "./secret-validation-rule-constraint-fns";

export type TCanDescribeLocation = (environment: string, secretPath: string) => boolean;

export type TSecretValidationFailure = {
  secretKey: string;
  ruleName: string;
  violation: TConstraintViolation;
};

export const describeSecretValidationViolation = (
  { ruleName, violation }: TSecretValidationFailure,
  canDescribeLocation?: TCanDescribeLocation
) => {
  const duplicate = violation.duplicateOf;
  const message =
    duplicate && canDescribeLocation?.(duplicate.environment, duplicate.secretPath)
      ? `value is already used by secret "${duplicate.key}" in environment "${duplicate.environment}" at path "${duplicate.secretPath}"`
      : violation.message;

  return `${message} (rule: "${ruleName}", constraint: ${violation.label})`;
};

export const describeSecretValidationFailures = (
  failures: TSecretValidationFailure[],
  canDescribeLocation?: TCanDescribeLocation
) => {
  const described = failures.map(
    (failure) => `Secret "${failure.secretKey}": ${describeSecretValidationViolation(failure, canDescribeLocation)}`
  );
  return `Secret validation failed:\n${described.join("\n\n")}`;
};

export class SecretValidationError extends BadRequestError {
  readonly failures: TSecretValidationFailure[];

  constructor(failures: TSecretValidationFailure[]) {
    super({ message: describeSecretValidationFailures(failures) });
    this.failures = failures;
  }
}
