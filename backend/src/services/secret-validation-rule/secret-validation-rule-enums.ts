export enum SecretValidationRuleType {
  StaticSecrets = "static-secrets",
  DynamicSecrets = "dynamic-secrets",
  SecretRotations = "secret-rotations"
}

export enum ConstraintKind {
  MinLength = "min-length",
  MaxLength = "max-length",
  RegexPattern = "regex-pattern",
  RequiredPrefix = "required-prefix",
  RequiredSuffix = "required-suffix",
  ReusePreviousVersions = "reuse-previous-versions",
  ReuseOtherSecrets = "reuse-other-secrets"
}

export enum ConstraintTarget {
  SecretKey = "key",
  SecretValue = "value",
  GeneratedPassword = "password"
}

// Providers selectable in a dynamic secret rule. Keep aligned with `DynamicSecretProviders`.
export enum DynamicSecretRuleProvider {
  SqlDatabase = "sql-database",
  Milvus = "milvus"
}

// Providers selectable in a secret rotation rule. Keep aligned with `SecretRotation`.
export enum SecretRotationRuleProvider {
  PostgresCredentials = "postgres-credentials",
  MySqlCredentials = "mysql-credentials",
  MsSqlCredentials = "mssql-credentials",
  OracleDBCredentials = "oracledb-credentials",
  UnixLinuxLocalAccount = "unix-linux-local-account",
  LdapPassword = "ldap-password"
}
