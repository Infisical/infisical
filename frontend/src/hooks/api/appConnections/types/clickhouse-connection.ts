import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

import { TBaseSqlConnectionCredentials } from "./shared";

export enum ClickHouseConnectionMethod {
  UsernameAndPassword = "username-and-password"
}

export type TClickHouseConnection = TRootAppConnection & { app: AppConnection.ClickHouse } & {
  method: ClickHouseConnectionMethod.UsernameAndPassword;
  credentials: TBaseSqlConnectionCredentials;
};
