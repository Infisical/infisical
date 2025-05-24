import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

import { TBaseSqlConnectionCredentials } from "./shared";

export enum MySqlConnectionMethod {
  UsernameAndPassword = "username-and-password"
}

export type TMySqlConnection = TRootAppConnection & { app: AppConnection.MySql } & {
  method: MySqlConnectionMethod.UsernameAndPassword;
  credentials: TBaseSqlConnectionCredentials;
};
