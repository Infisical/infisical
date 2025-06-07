import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerAuth0ClientSecretRotationRouter } from "./auth0-client-secret-rotation-router";
import { registerAwsIamUserSecretRotationRouter } from "./aws-iam-user-secret-rotation-router";
import { registerAzureClientSecretRotationRouter } from "./azure-client-secret-rotation-router";
import { registerLdapPasswordRotationRouter } from "./ldap-password-rotation-router";
import { registerMsSqlCredentialsRotationRouter } from "./mssql-credentials-rotation-router";
import { registerMySqlCredentialsRotationRouter } from "./mysql-credentials-rotation-router";
import { registerOracleDBCredentialsRotationRouter } from "./oracledb-credentials-rotation-router";
import { registerPostgresCredentialsRotationRouter } from "./postgres-credentials-rotation-router";

export * from "./secret-rotation-v2-router";

export const SECRET_ROTATION_REGISTER_ROUTER_MAP: Record<
  SecretRotation,
  (server: FastifyZodProvider) => Promise<void>
> = {
  [SecretRotation.PostgresCredentials]: registerPostgresCredentialsRotationRouter,
  [SecretRotation.MsSqlCredentials]: registerMsSqlCredentialsRotationRouter,
  [SecretRotation.MySqlCredentials]: registerMySqlCredentialsRotationRouter,
  [SecretRotation.OracleDBCredentials]: registerOracleDBCredentialsRotationRouter,
  [SecretRotation.Auth0ClientSecret]: registerAuth0ClientSecretRotationRouter,
  [SecretRotation.AzureClientSecret]: registerAzureClientSecretRotationRouter,
  [SecretRotation.AwsIamUserSecret]: registerAwsIamUserSecretRotationRouter,
  [SecretRotation.LdapPassword]: registerLdapPasswordRotationRouter
};
