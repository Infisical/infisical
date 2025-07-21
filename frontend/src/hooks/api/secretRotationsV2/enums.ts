export enum SecretRotation {
  PostgresCredentials = "postgres-credentials",
  MsSqlCredentials = "mssql-credentials",
  MySqlCredentials = "mysql-credentials",
  OracleDBCredentials = "oracledb-credentials",
  Auth0ClientSecret = "auth0-client-secret",
  AzureClientSecret = "azure-client-secret",
  LdapPassword = "ldap-password",
  AwsIamUserSecret = "aws-iam-user-secret",
  OktaClientSecret = "okta-client-secret"
}

export enum SecretRotationStatus {
  Success = "success",
  Failed = "failed"
}
