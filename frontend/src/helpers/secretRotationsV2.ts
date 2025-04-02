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

export const getRotateAtLocal = ({ hours, minutes }: TSecretRotationV2["rotateAtUtc"]) => {
  const now = new Date();

  // convert utc rotation time to local datetime
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes, 0, 0)
  );
};
