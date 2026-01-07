import { z } from "zod";

import { Auth0ClientSecretRotationSchema } from "@app/ee/services/secret-rotation-v2/auth0-client-secret";
import { AwsIamUserSecretRotationSchema } from "@app/ee/services/secret-rotation-v2/aws-iam-user-secret";
import { AzureClientSecretRotationSchema } from "@app/ee/services/secret-rotation-v2/azure-client-secret";
import { DatabricksServiceAccountSecretRotationSchema } from "@app/ee/services/secret-rotation-v2/databricks-service-account-secret";
import { LdapPasswordRotationSchema } from "@app/ee/services/secret-rotation-v2/ldap-password";
import { MongoDBCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/mongodb-credentials";
import { MsSqlCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/mssql-credentials";
import { MySqlCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/mysql-credentials";
import { OktaClientSecretRotationSchema } from "@app/ee/services/secret-rotation-v2/okta-client-secret";
import { OracleDBCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/oracledb-credentials";
import { PostgresCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/postgres-credentials";
import { RedisCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/redis-credentials";

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
  DatabricksServiceAccountSecretRotationSchema
]);
