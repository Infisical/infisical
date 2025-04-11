import { z } from "zod";

import { Auth0ClientSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/auth0-client-secret-rotation-schema";
import { MsSqlCredentialsRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/mssql-credentials-rotation-schema";
import { PostgresCredentialsRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/postgres-credentials-rotation-schema";

const SecretRotationUnionSchema = z.discriminatedUnion("type", [
  PostgresCredentialsRotationSchema,
  MsSqlCredentialsRotationSchema,
  Auth0ClientSecretRotationSchema
]);

export const SecretRotationV2FormSchema = SecretRotationUnionSchema;

export type TSecretRotationV2Form = z.infer<typeof SecretRotationV2FormSchema>;
