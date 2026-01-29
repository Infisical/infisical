import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

import { registerAuth0ClientSecretRotationRouter } from "./auth0-client-secret-rotation-router";
import { registerAwsIamUserSecretRotationRouter } from "./aws-iam-user-secret-rotation-router";
import { registerAzureClientSecretRotationRouter } from "./azure-client-secret-rotation-router";
import { registerDatabricksServicePrincipalSecretRotationRouter } from "./databricks-service-principal-secret-rotation-router";
import { registerLdapPasswordRotationRouter } from "./ldap-password-rotation-router";
import { registerMongoDBCredentialsRotationRouter } from "./mongodb-credentials-rotation-router";
import { registerMsSqlCredentialsRotationRouter } from "./mssql-credentials-rotation-router";
import { registerMySqlCredentialsRotationRouter } from "./mysql-credentials-rotation-router";
import { registerOktaClientSecretRotationRouter } from "./okta-client-secret-rotation-router";
import { registerOpenRouterApiKeyRotationRouter } from "./open-router-api-key-rotation-router";
import { registerOracleDBCredentialsRotationRouter } from "./oracledb-credentials-rotation-router";
import { registerPostgresCredentialsRotationRouter } from "./postgres-credentials-rotation-router";
import { registerRedisCredentialsRotationRouter } from "./redis-credentials-rotation-router";
import { registerUnixLinuxLocalAccountRotationRouter } from "./unix-linux-local-account-rotation-router";
import { registerWindowsLocalAccountRotationRouter } from "./windows-local-account-rotation-router";

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
  [SecretRotation.LdapPassword]: registerLdapPasswordRotationRouter,
  [SecretRotation.OktaClientSecret]: registerOktaClientSecretRotationRouter,
  [SecretRotation.RedisCredentials]: registerRedisCredentialsRotationRouter,
  [SecretRotation.MongoDBCredentials]: registerMongoDBCredentialsRotationRouter,
  [SecretRotation.DatabricksServicePrincipalSecret]: registerDatabricksServicePrincipalSecretRotationRouter,
  [SecretRotation.UnixLinuxLocalAccount]: registerUnixLinuxLocalAccountRotationRouter,
  [SecretRotation.WindowsLocalAccount]: registerWindowsLocalAccountRotationRouter
  [SecretRotation.OpenRouterApiKey]: registerOpenRouterApiKeyRotationRouter
};
