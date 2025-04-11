import { z } from "zod";

import { Auth0ClientSecretRotationSchema } from "@app/ee/services/secret-rotation-v2/auth0-client-secret";
import { MsSqlCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/mssql-credentials";
import { PostgresCredentialsRotationSchema } from "@app/ee/services/secret-rotation-v2/postgres-credentials";

export const SecretRotationV2Schema = z.discriminatedUnion("type", [
  PostgresCredentialsRotationSchema,
  MsSqlCredentialsRotationSchema,
  Auth0ClientSecretRotationSchema
]);
