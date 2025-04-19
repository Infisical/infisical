export enum SecretRotation {
  PostgresCredentials = "postgres-credentials",
  MsSqlCredentials = "mssql-credentials",
  Auth0ClientSecret = "auth0-client-secret",
  LdapPassword = "ldap-password"
}

export enum SecretRotationStatus {
  Success = "success",
  Failed = "failed"
}
