import { z } from "zod";

import { TMsSqlConnection } from "@app/services/app-connection/mssql";

import {
  CreateMsSqlCredentialsRotationSchema,
  MsSqlCredentialsRotationListItemSchema,
  MsSqlCredentialsRotationSchema
} from "./mssql-credentials-rotation-schemas";

export type TMsSqlCredentialsRotation = z.infer<typeof MsSqlCredentialsRotationSchema>;

export type TMsSqlCredentialsRotationInput = z.infer<typeof CreateMsSqlCredentialsRotationSchema>;

export type TMsSqlCredentialsRotationListItem = z.infer<typeof MsSqlCredentialsRotationListItemSchema>;

export type TMsSqlCredentialsRotationWithConnection = TMsSqlCredentialsRotation & {
  connection: TMsSqlConnection;
};
