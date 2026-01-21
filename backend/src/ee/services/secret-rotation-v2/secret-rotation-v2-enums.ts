export enum SecretRotation {
  PostgresCredentials = "postgres-credentials",
  MsSqlCredentials = "mssql-credentials",
  MySqlCredentials = "mysql-credentials",
  OracleDBCredentials = "oracledb-credentials",
  Auth0ClientSecret = "auth0-client-secret",
  AzureClientSecret = "azure-client-secret",
  AwsIamUserSecret = "aws-iam-user-secret",
  LdapPassword = "ldap-password",
  OktaClientSecret = "okta-client-secret",
  RedisCredentials = "redis-credentials",
  MongoDBCredentials = "mongodb-credentials",
  DatabricksServicePrincipalSecret = "databricks-service-principal-secret",
  UnixLinuxLocalAccount = "unix-linux-local-account",
  WindowsLocalAccount = "windows-local-account"
}

export enum SecretRotationStatus {
  Success = "success",
  Failed = "failed"
}
