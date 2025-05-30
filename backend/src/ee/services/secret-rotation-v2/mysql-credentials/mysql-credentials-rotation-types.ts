import { z } from "zod";

import { TMySqlConnection } from "@app/services/app-connection/mysql";

import {
  CreateMySqlCredentialsRotationSchema,
  MySqlCredentialsRotationListItemSchema,
  MySqlCredentialsRotationSchema
} from "./mysql-credentials-rotation-schemas";

export type TMySqlCredentialsRotation = z.infer<typeof MySqlCredentialsRotationSchema>;

export type TMySqlCredentialsRotationInput = z.infer<typeof CreateMySqlCredentialsRotationSchema>;

export type TMySqlCredentialsRotationListItem = z.infer<typeof MySqlCredentialsRotationListItemSchema>;

export type TMySqlCredentialsRotationWithConnection = TMySqlCredentialsRotation & {
  connection: TMySqlConnection;
};
