import { z } from "zod";

import { TOracleDBConnection } from "../../app-connections/oracledb";
import {
  CreateOracleDBCredentialsRotationSchema,
  OracleDBCredentialsRotationListItemSchema,
  OracleDBCredentialsRotationSchema
} from "./oracledb-credentials-rotation-schemas";

export type TOracleDBCredentialsRotation = z.infer<typeof OracleDBCredentialsRotationSchema>;

export type TOracleDBCredentialsRotationInput = z.infer<typeof CreateOracleDBCredentialsRotationSchema>;

export type TOracleDBCredentialsRotationListItem = z.infer<typeof OracleDBCredentialsRotationListItemSchema>;

export type TOracleDBCredentialsRotationWithConnection = TOracleDBCredentialsRotation & {
  connection: TOracleDBConnection;
};
