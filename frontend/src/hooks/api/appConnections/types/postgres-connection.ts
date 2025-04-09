import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

import { TBaseSqlConnectionCredentials } from "./shared";

export enum PostgresConnectionMethod {
  UsernameAndPassword = "username-and-password"
}

export type TPostgresConnection = TRootAppConnection & { app: AppConnection.Postgres } & {
  method: PostgresConnectionMethod.UsernameAndPassword;
  credentials: TBaseSqlConnectionCredentials;
};
