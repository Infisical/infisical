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
}

// Provider identifiers selectable in dynamic-secret rules.
// Mirror of backend `DynamicSecretRuleProvider`.
export enum DynamicSecretRuleProvider {
  SqlDatabase = "sql-database",
  Milvus = "milvus"
}

// Provider identifiers selectable in secret-rotation rules.
// Mirror of backend `SecretRotationRuleProvider`.
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

export type TSecretValidationRuleInputs =
  | TStaticSecretsInputs
  | TDynamicSecretsInputs
  | TSecretRotationsInputs;

export type TSecretValidationRule = {
  id: string;
  name: string;
  description?: string | null;
  projectId: string;
  envId: string | null;
  secretPath: string;
  type: SecretValidationRuleType;
  inputs: TSecretValidationRuleInputs;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TListSecretValidationRulesDTO = {
  projectId: string;
};

export type TCreateSecretValidationRuleDTO = {
  projectId: string;
  name: string;
  description?: string | null;
  environmentSlug?: string;
  secretPath: string;
  rule: {
    type: SecretValidationRuleType;
    inputs: TSecretValidationRuleInputs;
  };
};

export type TUpdateSecretValidationRuleDTO = {
  projectId: string;
  ruleId: string;
  name?: string;
  description?: string | null;
  environmentSlug?: string | null;
  secretPath?: string;
  type?: SecretValidationRuleType;
  inputs?: TSecretValidationRuleInputs;
  isActive?: boolean;
};

export type TDeleteSecretValidationRuleDTO = {
  projectId: string;
  ruleId: string;
};
