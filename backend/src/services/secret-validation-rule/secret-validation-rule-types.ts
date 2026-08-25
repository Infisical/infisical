import { TSecretValidationRules } from "@app/db/schemas";
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
  PreventValueReuse = "prevent-value-reuse",
  PreventDuplicatedValues = "prevent-duplicated-values",
  UniqueSecretValue = "unique-secret-value"
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

export type TSecretValidationRuleInputs = TStaticSecretsInputs | TDynamicSecretsInputs | TSecretRotationsInputs;

// A rule's type-specific configuration as it appears on the wire: the per-type
// fields sit alongside `type` rather than under an `inputs` wrapper, so `type`
// discriminates them. The stored blob (`encryptedInputs`) holds the same fields
// minus `type`, which has its own column.
export type TSecretValidationRuleConfig =
  | ({ type: SecretValidationRuleType.StaticSecrets } & TStaticSecretsInputs)
  | ({ type: SecretValidationRuleType.DynamicSecrets } & TDynamicSecretsInputs)
  | ({ type: SecretValidationRuleType.SecretRotations } & TSecretRotationsInputs);

// Discriminated rule shape returned by the service. The `type` field narrows
// the matching per-type fields so the response schema (which is a
// discriminated union over `type`) is satisfied without manual casts at
// each handler.
type TRuleCommonFields = Omit<TSecretValidationRules, "type" | "encryptedInputs">;

export type TSecretValidationRuleRecord = TRuleCommonFields & TSecretValidationRuleConfig;

export type TCreateSecretValidationRuleDTO = {
  name: string;
  description?: string | null;
  environmentSlug?: string;
  secretPath: string;
  rule: TSecretValidationRuleConfig;
} & TProjectPermission;

export type TUpdateSecretValidationRuleDTO = {
  ruleId: string;
  name?: string;
  description?: string | null;
  environmentSlug?: string | null;
  secretPath?: string;
  rule?: TSecretValidationRuleConfig;
  isActive?: boolean;
} & TProjectPermission;

export type TDeleteSecretValidationRuleDTO = {
  ruleId: string;
} & TProjectPermission;

export type TListSecretValidationRulesDTO = TProjectPermission;
