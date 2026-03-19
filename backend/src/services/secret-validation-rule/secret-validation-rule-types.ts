import { TProjectPermission } from "@app/lib/types";

export enum SecretValidationRuleType {
  StaticSecrets = "static-secrets"
}

export enum ConstraintType {
  MinLength = "min-length",
  MaxLength = "max-length",
  RegexPattern = "regex-pattern",
  RequiredPrefix = "required-prefix",
  RequiredSuffix = "required-suffix"
}

export enum ConstraintTarget {
  SecretKey = "key",
  SecretValue = "value"
}

export type TConstraint = {
  type: ConstraintType;
  appliesTo: ConstraintTarget;
  value: string;
};

export type TStaticSecretsInputs = {
  constraints: TConstraint[];
};

export type TSecretValidationRuleInputs = TStaticSecretsInputs;

export type TCreateSecretValidationRuleDTO = {
  name: string;
  description?: string | null;
  environmentSlug: string;
  secretPath: string;
  type: SecretValidationRuleType;
  inputs: TSecretValidationRuleInputs;
} & TProjectPermission;

export type TUpdateSecretValidationRuleDTO = {
  ruleId: string;
  name?: string;
  description?: string | null;
  environmentSlug?: string;
  secretPath?: string;
  type?: SecretValidationRuleType;
  inputs?: TSecretValidationRuleInputs;
  isActive?: boolean;
} & TProjectPermission;

export type TDeleteSecretValidationRuleDTO = {
  ruleId: string;
} & TProjectPermission;

export type TListSecretValidationRulesDTO = TProjectPermission;
