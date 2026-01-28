import { z } from "zod";

import { Auth0ClientSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/auth0-client-secret-rotation-schema";
import { AwsIamUserSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/aws-iam-user-secret-rotation-schema";
import { AzureClientSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/azure-client-secret-rotation-schema";
import { DatabricksServicePrincipalSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/databricks-service-principal-secret-rotation-schema";
import { LdapPasswordRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/ldap-password-rotation-schema";
import { MongoDBCredentialsRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/mongodb-credentials-rotation-schema";
import { MsSqlCredentialsRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/mssql-credentials-rotation-schema";
import { MySqlCredentialsRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/mysql-credentials-rotation-schema";
import { PostgresCredentialsRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/postgres-credentials-rotation-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { LdapPasswordRotationMethod } from "@app/hooks/api/secretRotationsV2/types/ldap-password-rotation";
import { UnixLinuxLocalAccountRotationMethod } from "@app/hooks/api/secretRotationsV2/types/unix-linux-local-account-rotation";

import { OktaClientSecretRotationSchema } from "./okta-client-secret-rotation-schema";
import { OracleDBCredentialsRotationSchema } from "./oracledb-credentials-rotation-schema";
import { RedisCredentialsRotationSchema } from "./redis-credentials-rotation-schema";
import { UnixLinuxLocalAccountRotationSchema } from "./unix-linux-local-account-rotation-schema";
import { DbtServiceTokenRotationSchema } from "./dbt-service-token-rotation-schema";

export const SecretRotationV2FormSchema = (isUpdate: boolean) =>
  z
    .intersection(
      z.discriminatedUnion("type", [
        Auth0ClientSecretRotationSchema,
        AzureClientSecretRotationSchema,
        PostgresCredentialsRotationSchema,
        MsSqlCredentialsRotationSchema,
        MySqlCredentialsRotationSchema,
        OracleDBCredentialsRotationSchema,
        LdapPasswordRotationSchema,
        AwsIamUserSecretRotationSchema,
        OktaClientSecretRotationSchema,
        RedisCredentialsRotationSchema,
        MongoDBCredentialsRotationSchema,
        DatabricksServicePrincipalSecretRotationSchema,
        UnixLinuxLocalAccountRotationSchema,
        DbtServiceTokenRotationSchema
      ]),
      z.object({ id: z.string().optional() })
    )
    .superRefine((val, ctx) => {
      if (isUpdate) return;

      // this has to go on union or breaks discrimination
      if (val.type === SecretRotation.LdapPassword) {
        if (
          val.parameters.rotationMethod === LdapPasswordRotationMethod.TargetPrincipal &&
          !val.temporaryParameters?.password
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password required",
            path: ["temporaryParameters", "password"]
          });
        }
      }

      if (val.type === SecretRotation.UnixLinuxLocalAccount) {
        if (
          val.parameters.rotationMethod === UnixLinuxLocalAccountRotationMethod.LoginAsTarget &&
          !val.temporaryParameters?.password
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password required",
            path: ["temporaryParameters", "password"]
          });
        }
      }
    });

export type TSecretRotationV2Form = z.infer<ReturnType<typeof SecretRotationV2FormSchema>>;
