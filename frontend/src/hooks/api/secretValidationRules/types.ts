import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

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
  PostgresCredentials = "postgres-credentials",
  MySqlCredentials = "mysql-credentials",
  MsSqlCredentials = "mssql-credentials",
  OracleDBCredentials = "oracledb-credentials",
  UnixLinuxLocalAccount = "unix-linux-local-account",
  LdapPassword = "ldap-password"
}

// Maps SecretRotation types to their corresponding validation rule provider.
// Used by rotation forms to look up the correct provider for ValidationRuleOverrideNotice.
export const SECRET_ROTATION_TO_RULE_PROVIDER: Partial<
  Record<SecretRotation, SecretRotationRuleProvider>
> = {
  [SecretRotation.PostgresCredentials]: SecretRotationRuleProvider.PostgresCredentials,
  [SecretRotation.MySqlCredentials]: SecretRotationRuleProvider.MySqlCredentials,
  [SecretRotation.MsSqlCredentials]: SecretRotationRuleProvider.MsSqlCredentials,
  [SecretRotation.OracleDBCredentials]: SecretRotationRuleProvider.OracleDBCredentials,
  [SecretRotation.UnixLinuxLocalAccount]: SecretRotationRuleProvider.UnixLinuxLocalAccount,
  [SecretRotation.LdapPassword]: SecretRotationRuleProvider.LdapPassword
};

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
