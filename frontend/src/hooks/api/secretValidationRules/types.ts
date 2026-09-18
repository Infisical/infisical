import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export enum SecretValidationRuleType {
  StaticSecrets = "static-secrets",
  DynamicSecrets = "dynamic-secrets",
  SecretRotations = "secret-rotations"
}

// Mirror of backend `DynamicSecretRuleProvider`.
export enum DynamicSecretRuleProvider {
  SqlDatabase = "sql-database",
  Milvus = "milvus"
}

// Mirror of backend `SecretRotationRuleProvider`.
export enum SecretRotationRuleProvider {
  PostgresCredentials = "postgres-credentials",
  MySqlCredentials = "mysql-credentials",
  MsSqlCredentials = "mssql-credentials",
  OracleDBCredentials = "oracledb-credentials",
  UnixLinuxLocalAccount = "unix-linux-local-account",
  LdapPassword = "ldap-password"
}

// Rotation forms use this to find the provider a ValidationRuleOverrideNotice should look up.
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

export const MAX_PREVENT_DUPLICATE_SECRET_VALUE_VERSIONS = 25;
export const MAX_CONSTRAINT_LENGTH = 2048;

// every constraint field a target supports. a field left out is not enforced
export type TConstraints = {
  minLength?: number;
  maxLength?: number;
  regexPattern?: string;
  requiredPrefix?: string;
  requiredSuffix?: string;
};

export type TReusePrevention = {
  previousVersions?: number;
};

export type TValueConstraints = TConstraints & {
  reusePrevention?: TReusePrevention;
};

export type TStaticSecretsRuleConfig = {
  keyConstraints?: TConstraints;
  valueConstraints?: TValueConstraints;
};

export type TDynamicSecretsRuleConfig = {
  providers: DynamicSecretRuleProvider[];
  passwordConstraints: TConstraints;
};

export type TSecretRotationsRuleConfig = {
  providers: SecretRotationRuleProvider[];
  passwordConstraints: TConstraints;
};

export type TSecretValidationRuleConfig =
  | ({ type: SecretValidationRuleType.StaticSecrets } & TStaticSecretsRuleConfig)
  | ({ type: SecretValidationRuleType.DynamicSecrets } & TDynamicSecretsRuleConfig)
  | ({ type: SecretValidationRuleType.SecretRotations } & TSecretRotationsRuleConfig);

type TSecretValidationRuleBase = {
  id: string;
  name: string;
  description?: string | null;
  projectId: string;
  // Null when the rule covers every environment in the project.
  environment: { id: string; name: string; slug: string } | null;
  secretPath: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TSecretValidationRule = TSecretValidationRuleBase & TSecretValidationRuleConfig;

export type TListSecretValidationRulesDTO = {
  projectId: string;
};

type TRuleScopeFields = {
  name: string;
  description?: string | null;
  environment?: string;
  secretPath: string;
  isActive?: boolean;
};

export type TGeneratedCredentialProvider = DynamicSecretRuleProvider | SecretRotationRuleProvider;

type TAnyRuleConfigFields = {
  keyConstraints?: TConstraints;
  valueConstraints?: TValueConstraints;
  providers?: TGeneratedCredentialProvider[];
  passwordConstraints?: TConstraints;
};

export type TCreateSecretValidationRuleDTO = TRuleScopeFields &
  TAnyRuleConfigFields & {
    projectId: string;
    type: SecretValidationRuleType;
  };

export type TUpdateSecretValidationRuleDTO = Partial<Omit<TRuleScopeFields, "environment">> & {
  projectId: string;
  ruleId: string;
  type: SecretValidationRuleType;
  // Null makes the rule cover every environment in the project.
  environment?: string | null;
  // Each constraint target is replaced when supplied, cleared when null, left alone when omitted.
  keyConstraints?: TConstraints | null;
  valueConstraints?: TValueConstraints | null;
  providers?: TGeneratedCredentialProvider[];
  passwordConstraints?: TConstraints;
};

export type TDeleteSecretValidationRuleDTO = {
  projectId: string;
  ruleId: string;
  type: SecretValidationRuleType;
};
