import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

import { TBaseSqlConnectionCredentials } from "./shared";

export enum MsSqlConnectionMethod {
  UsernameAndPassword = "username-and-password"
}

export type TMsSqlConnection = TRootAppConnection & { app: AppConnection.MsSql } & {
  method: MsSqlConnectionMethod.UsernameAndPassword;
  credentials: TBaseSqlConnectionCredentials;
};
