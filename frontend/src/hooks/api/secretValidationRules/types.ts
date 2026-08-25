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
  UniqueSecretValue = "unique-secret-value"
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

export type StringConstraintType = Exclude<ConstraintType, ConstraintType.UniqueSecretValue>;

export type TUniqueSecretValueBody = {
  secretVersions: {
    enabled: boolean;
    versions: number;
  };
  otherSecrets: {
    enabled: boolean;
  };
};

export type TStringConstraint = {
  type: StringConstraintType;
  appliesTo: ConstraintTarget;
  value: string;
};

export type TUniqueSecretValueConstraint = {
  type: ConstraintType.UniqueSecretValue;
  appliesTo: ConstraintTarget;
  value: TUniqueSecretValueBody;
};

export type TConstraint = TStringConstraint | TUniqueSecretValueConstraint;

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

// A rule's type-specific configuration: the per-type fields sit alongside
// `type`, which discriminates them. Mirror of backend `TSecretValidationRuleConfig`.
export type TSecretValidationRuleConfig =
  | ({ type: SecretValidationRuleType.StaticSecrets } & TStaticSecretsInputs)
  | ({ type: SecretValidationRuleType.DynamicSecrets } & TDynamicSecretsInputs)
  | ({ type: SecretValidationRuleType.SecretRotations } & TSecretRotationsInputs);

type TSecretValidationRuleBase = {
  id: string;
  name: string;
  description?: string | null;
  projectId: string;
  envId: string | null;
  secretPath: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TSecretValidationRule = TSecretValidationRuleBase & TSecretValidationRuleConfig;

export type TListSecretValidationRulesDTO = {
  projectId: string;
};

export type TCreateSecretValidationRuleDTO = {
  projectId: string;
  name: string;
  description?: string | null;
  environmentSlug?: string;
  secretPath: string;
  rule: TSecretValidationRuleConfig;
};

export type TUpdateSecretValidationRuleDTO = {
  projectId: string;
  ruleId: string;
  name?: string;
  description?: string | null;
  environmentSlug?: string | null;
  secretPath?: string;
  // Replaced as a whole when supplied; omit to leave the stored config untouched.
  rule?: TSecretValidationRuleConfig;
  isActive?: boolean;
};

export type TDeleteSecretValidationRuleDTO = {
  projectId: string;
  ruleId: string;
};
