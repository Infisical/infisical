export enum SecretRotation {
  PostgresCredentials = "postgres-credentials",
  MsSqlCredentials = "mssql-credentials"
}

export enum SecretRotationStatus {
  Success = "success",
  Failed = "failed"
}
