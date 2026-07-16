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

// Discriminated rule shape returned by the service. The `type` field narrows
// the matching `inputs` shape so the response schema (which is a
// discriminated union over `type`) is satisfied without manual casts at
// each handler.
type TRuleCommonFields = Omit<TSecretValidationRules, "type">;

export type TSecretValidationRuleRecord =
  | (TRuleCommonFields & { type: SecretValidationRuleType.StaticSecrets; inputs: TStaticSecretsInputs })
  | (TRuleCommonFields & { type: SecretValidationRuleType.DynamicSecrets; inputs: TDynamicSecretsInputs })
  | (TRuleCommonFields & { type: SecretValidationRuleType.SecretRotations; inputs: TSecretRotationsInputs });

// `inputs` is validated server-side by `parseSecretValidationRuleInputs` against
// the resolved rule type, so the DTO accepts `unknown` rather than a structured
// union. The shape can't be known at the route boundary because `type` and
// `inputs` are sibling fields and a per-type Zod union would silently strip
// fields when sibling members happen to also match.
export type TCreateSecretValidationRuleDTO = {
  name: string;
  description?: string | null;
  environmentSlug?: string;
  secretPath: string;
  type: SecretValidationRuleType;
  inputs: unknown;
} & TProjectPermission;

export type TUpdateSecretValidationRuleDTO = {
  ruleId: string;
  name?: string;
  description?: string | null;
  environmentSlug?: string | null;
  secretPath?: string;
  type?: SecretValidationRuleType;
  inputs?: unknown;
  isActive?: boolean;
} & TProjectPermission;

export type TDeleteSecretValidationRuleDTO = {
  ruleId: string;
} & TProjectPermission;

export type TListSecretValidationRulesDTO = TProjectPermission;
