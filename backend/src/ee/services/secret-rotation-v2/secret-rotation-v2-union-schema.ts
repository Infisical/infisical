import { z } from "zod";

import { Auth0ClientSecretRotationSchema } from "@app/ee/services/secret-rotation-v2/auth0-client-secret";
import { AwsIamUserSecretRotationSchema } from "@app/ee/services/secret-rotation-v2/aws-iam-user-secret";
import { AzureClientSecretRotationSchema } from "@app/ee/services/secret-rotation-v2/azure-client-secret";
import { DatabricksServicePrincipalSecretRotationSchema } from "@app/ee/services/secret-rotation-v2/databricks-service-principal-secret";
import { LdapPasswordRotationSchema } from "@app/ee/services/secret-rotation-v2/ldap-password";
import { MongoDBCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/mongodb-credentials";
import { MsSqlCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/mssql-credentials";
import { MySqlCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/mysql-credentials";
import { OktaClientSecretRotationSchema } from "@app/ee/services/secret-rotation-v2/okta-client-secret";
import { OpenRouterApiKeyRotationSchema } from "@app/ee/services/secret-rotation-v2/open-router-api-key";
import { OracleDBCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/oracledb-credentials";
import { PostgresCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/postgres-credentials";
import { RedisCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/redis-credentials";
import { UnixLinuxLocalAccountRotationSchema } from "@app/ee/services/secret-rotation-v2/unix-linux-local-account-rotation";

export const SecretRotationV2Schema = z.discriminatedUnion("type", [
  PostgresCredentialsRotationSchema,
  MsSqlCredentialsRotationSchema,
  MySqlCredentialsRotationSchema,
  OracleDBCredentialsRotationSchema,
  Auth0ClientSecretRotationSchema,
  AzureClientSecretRotationSchema,
  LdapPasswordRotationSchema,
  AwsIamUserSecretRotationSchema,
  OktaClientSecretRotationSchema,
  RedisCredentialsRotationSchema,
  MongoDBCredentialsRotationSchema,
  DatabricksServicePrincipalSecretRotationSchema,
  UnixLinuxLocalAccountRotationSchema,
  OpenRouterApiKeyRotationSchema
]);
