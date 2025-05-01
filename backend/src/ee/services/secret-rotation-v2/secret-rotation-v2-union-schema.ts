import { z } from "zod";

import { Auth0ClientSecretRotationSchema } from "@app/ee/services/secret-rotation-v2/auth0-client-secret";
import { AzureClientSecretRotationSchema } from "@app/ee/services/secret-rotation-v2/azure-client-secret";
import { LdapPasswordRotationSchema } from "@app/ee/services/secret-rotation-v2/ldap-password";
import { MsSqlCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/mssql-credentials";
import { PostgresCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/postgres-credentials";

import { AwsIamUserSecretRotationSchema } from "./aws-iam-user-secret";

export const SecretRotationV2Schema = z.discriminatedUnion("type", [
  PostgresCredentialsRotationSchema,
  MsSqlCredentialsRotationSchema,
  Auth0ClientSecretRotationSchema,
  AzureClientSecretRotationSchema,
  LdapPasswordRotationSchema,
  AwsIamUserSecretRotationSchema
]);
