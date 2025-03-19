import { z } from "zod";

import { TPostgresConnection } from "@app/services/app-connection/postgres";

import {
  CreatePostgresLoginCredentialsRotationSchema,
  PostgresLoginCredentialsRotationListItemSchema,
  PostgresLoginCredentialsRotationSchema
} from "./postgres-login-credentials-rotation-schemas";

export type TPostgresLoginCredentialsRotation = z.infer<typeof PostgresLoginCredentialsRotationSchema>;

export type TPostgresLoginCredentialsRotationInput = z.infer<typeof CreatePostgresLoginCredentialsRotationSchema>;

export type TPostgresLoginCredentialsRotationListItem = z.infer<typeof PostgresLoginCredentialsRotationListItemSchema>;

export type TPostgresLoginCredentialsRotationWithConnection = TPostgresLoginCredentialsRotation & {
  connection: TPostgresConnection;
};
