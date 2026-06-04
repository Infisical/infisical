import { TProjectPermission } from "@app/lib/types";

export enum SecretValidationRuleType {
  StaticSecrets = "static-secrets",
  DynamicSecrets = "dynamic-secrets",
  SecretRotations = "secret-rotations"
}

export enum ConstraintType {
  MinLength = "min-length",
  MaxLength = "max-length",
  RegexPattern = "regex-pattern",
  RequiredPrefix = "required-prefix",
  RequiredSuffix = "required-suffix",
  PreventValueReuse = "prevent-value-reuse"
}

export enum ConstraintTarget {
  SecretKey = "key",
  SecretValue = "value",
  GeneratedPassword = "password"
  // Future: GeneratedUsername = "username"
}

// Provider identifiers selectable in dynamic-secret rules.
// Keep aligned with `DynamicSecretProviders` in dynamic-secret/providers/models.ts.
export enum DynamicSecretRuleProvider {
  SqlDatabase = "sql-database",
  Milvus = "milvus"
}

// Provider identifiers selectable in secret-rotation rules.
// Keep aligned with `SecretRotation` in secret-rotation-v2-enums.ts.
export enum SecretRotationRuleProvider {
  PostgresCredentials = "postgres-credentials"
}

export type TConstraint = {
  type: ConstraintType;
  appliesTo: ConstraintTarget;
  value: string;
};

export type TStaticSecretsInputs = {
  constraints: TConstraint[];
};

export type TDynamicSecretsInputs = {
  providers: DynamicSecretRuleProvider[];
  constraints: TConstraint[];
};

export type TSecretRotationsInputs = {
  providers: SecretRotationRuleProvider[];
  constraints: TConstraint[];
};

export type TSecretValidationRuleInputs = TStaticSecretsInputs | TDynamicSecretsInputs | TSecretRotationsInputs;

export type TCreateSecretValidationRuleDTO = {
  name: string;
  description?: string | null;
  environmentSlug?: string;
  secretPath: string;
  type: SecretValidationRuleType;
  inputs: TSecretValidationRuleInputs;
} & TProjectPermission;

export type TUpdateSecretValidationRuleDTO = {
  ruleId: string;
  name?: string;
  description?: string | null;
  environmentSlug?: string | null;
  secretPath?: string;
  type?: SecretValidationRuleType;
  inputs?: TSecretValidationRuleInputs;
  isActive?: boolean;
} & TProjectPermission;

export type TDeleteSecretValidationRuleDTO = {
  ruleId: string;
} & TProjectPermission;

export type TListSecretValidationRulesDTO = TProjectPermission;
