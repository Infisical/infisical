import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

import { TBaseSqlConnectionCredentials } from "./shared";

export enum OracleDBConnectionMethod {
  UsernameAndPassword = "username-and-password"
}

export type TOracleDBConnection = TRootAppConnection & { app: AppConnection.OracleDB } & {
  method: OracleDBConnectionMethod.UsernameAndPassword;
  credentials: TBaseSqlConnectionCredentials;
};
