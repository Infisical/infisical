import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const SECRET_ROTATION_NAME_MAP: Record<SecretRotation, string> = {
  [SecretRotation.PostgresLoginCredentials]: "PostgreSQL Login Credentials",
  [SecretRotation.MsSqlLoginCredentials]: "Microsoft SQL Sever Login Credentials"
};

export const SECRET_ROTATION_CONNECTION_MAP: Record<SecretRotation, AppConnection> = {
  [SecretRotation.PostgresLoginCredentials]: AppConnection.Postgres,
  [SecretRotation.MsSqlLoginCredentials]: AppConnection.MsSql
};
