import { z } from "zod";

import { Auth0ClientSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/auth0-client-secret-rotation-schema";
import { AwsIamUserSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/aws-iam-user-secret-rotation-schema";
import { AzureClientSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/azure-client-secret-rotation-schema";
import { LdapPasswordRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/ldap-password-rotation-schema";
import { MsSqlCredentialsRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/mssql-credentials-rotation-schema";
import { PostgresCredentialsRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/postgres-credentials-rotation-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { LdapPasswordRotationMethod } from "@app/hooks/api/secretRotationsV2/types/ldap-password-rotation";

export const SecretRotationV2FormSchema = (isUpdate: boolean) =>
  z
    .intersection(
      z.discriminatedUnion("type", [
        Auth0ClientSecretRotationSchema,
        AzureClientSecretRotationSchema,
        PostgresCredentialsRotationSchema,
        MsSqlCredentialsRotationSchema,
        LdapPasswordRotationSchema,
        AwsIamUserSecretRotationSchema
      ]),
      z.object({ id: z.string().optional() })
    )
    .superRefine((val, ctx) => {
      if (val.type !== SecretRotation.LdapPassword || isUpdate) return;

      // this has to go on union or breaks discrimination
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
    });

export type TSecretRotationV2Form = z.infer<ReturnType<typeof SecretRotationV2FormSchema>>;
