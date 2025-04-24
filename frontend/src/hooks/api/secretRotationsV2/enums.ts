export enum SecretRotation {
  PostgresCredentials = "postgres-credentials",
  MsSqlCredentials = "mssql-credentials",
  Auth0ClientSecret = "auth0-client-secret"
}

export enum SecretRotationStatus {
  Success = "success",
  Failed = "failed"
}
