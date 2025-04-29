import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation, TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";

export const SECRET_ROTATION_MAP: Record<
  SecretRotation,
  { name: string; image: string; size: number }
> = {
  [SecretRotation.PostgresCredentials]: {
    name: "PostgreSQL Credentials",
    image: "Postgres.png",
    size: 45
  },
  [SecretRotation.MsSqlCredentials]: {
    name: "Microsoft SQL Server Credentials",
    image: "MsSql.png",
    size: 50
  },
  [SecretRotation.Auth0ClientSecret]: {
    name: "Auth0 Client Secret",
    image: "Auth0.png",
    size: 35
  },
  [SecretRotation.AzureClientSecret]: {
    name: "Azure Client Secret",
    image: "Microsoft Azure.png",
    size: 65
  },
  [SecretRotation.LdapPassword]: {
    name: "LDAP Password",
    image: "LDAP.png",
    size: 65
  },
  [SecretRotation.AwsIamUserSecret]: {
    name: "AWS IAM User Secret",
    image: "Amazon Web Services.png",
    size: 50
  }
};

export const SECRET_ROTATION_CONNECTION_MAP: Record<SecretRotation, AppConnection> = {
  [SecretRotation.PostgresCredentials]: AppConnection.Postgres,
  [SecretRotation.MsSqlCredentials]: AppConnection.MsSql,
  [SecretRotation.Auth0ClientSecret]: AppConnection.Auth0,
  [SecretRotation.AzureClientSecret]: AppConnection.AzureClientSecrets,
  [SecretRotation.LdapPassword]: AppConnection.LDAP,
  [SecretRotation.AwsIamUserSecret]: AppConnection.AWS
};

// if a rotation can potentially have downtime due to rotating a single credential set this to false
export const IS_ROTATION_DUAL_CREDENTIALS: Record<SecretRotation, boolean> = {
  [SecretRotation.PostgresCredentials]: true,
  [SecretRotation.MsSqlCredentials]: true,
  [SecretRotation.Auth0ClientSecret]: false,
  [SecretRotation.AzureClientSecret]: true,
  [SecretRotation.LdapPassword]: false,
  [SecretRotation.AwsIamUserSecret]: true
};

export const getRotateAtLocal = ({ hours, minutes }: TSecretRotationV2["rotateAtUtc"]) => {
  const now = new Date();

  // convert utc rotation time to local datetime
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes, 0, 0)
  );
};
