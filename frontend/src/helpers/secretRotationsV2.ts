import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation, TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";

export const SECRET_ROTATION_MAP: Record<SecretRotation, { name: string; image: string }> = {
  [SecretRotation.PostgresCredentials]: { name: "PostgreSQL Credentials", image: "Postgres.png" },
  [SecretRotation.MsSqlCredentials]: {
    name: "Microsoft SQL Server Credentials",
    image: "MsSql.png"
  }
};

export const SECRET_ROTATION_CONNECTION_MAP: Record<SecretRotation, AppConnection> = {
  [SecretRotation.PostgresCredentials]: AppConnection.Postgres,
  [SecretRotation.MsSqlCredentials]: AppConnection.MsSql
};

export const getRotateAtLocal = ({ hours, minutes }: TSecretRotationV2["rotateAtUtc"]) =>
  new Date(
    Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
      hours,
      minutes,
      0,
      0
    )
  );
