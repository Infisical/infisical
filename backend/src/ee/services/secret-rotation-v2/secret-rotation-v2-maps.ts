import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const SECRET_ROTATION_NAME_MAP: Record<SecretRotation, string> = {
  [SecretRotation.PostgresCredentials]: "PostgreSQL Credentials",
  [SecretRotation.MsSqlCredentials]: "Microsoft SQL Server Credentials",
  [SecretRotation.Auth0ClientSecret]: "Auth0 Client Secret",
  [SecretRotation.AzureClientSecret]: "Azure Client Secret",
  [SecretRotation.AwsIamUserSecret]: "AWS IAM User Secret",
  [SecretRotation.LdapPassword]: "LDAP Password"
};

export const SECRET_ROTATION_CONNECTION_MAP: Record<SecretRotation, AppConnection> = {
  [SecretRotation.PostgresCredentials]: AppConnection.Postgres,
  [SecretRotation.MsSqlCredentials]: AppConnection.MsSql,
  [SecretRotation.Auth0ClientSecret]: AppConnection.Auth0,
  [SecretRotation.AzureClientSecret]: AppConnection.AzureClientSecrets,
  [SecretRotation.AwsIamUserSecret]: AppConnection.AWS,
  [SecretRotation.LdapPassword]: AppConnection.LDAP
};
