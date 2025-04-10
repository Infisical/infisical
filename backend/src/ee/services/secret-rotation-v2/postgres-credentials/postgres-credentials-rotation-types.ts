import { z } from "zod";

import { TPostgresConnection } from "@app/services/app-connection/postgres";

import {
  CreatePostgresCredentialsRotationSchema,
  PostgresCredentialsRotationListItemSchema,
  PostgresCredentialsRotationSchema
} from "./postgres-credentials-rotation-schemas";

export type TPostgresCredentialsRotation = z.infer<typeof PostgresCredentialsRotationSchema>;

export type TPostgresCredentialsRotationInput = z.infer<typeof CreatePostgresCredentialsRotationSchema>;

export type TPostgresCredentialsRotationListItem = z.infer<typeof PostgresCredentialsRotationListItemSchema>;

export type TPostgresCredentialsRotationWithConnection = TPostgresCredentialsRotation & {
  connection: TPostgresConnection;
};
