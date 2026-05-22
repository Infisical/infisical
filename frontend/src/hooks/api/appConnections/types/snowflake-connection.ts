import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum SnowflakeConnectionMethod {
  UsernameAndToken = "username-and-token"
}

export type TSnowflakeConnection = TRootAppConnection & { app: AppConnection.Snowflake } & {
  method: SnowflakeConnectionMethod.UsernameAndToken;
  credentials: {
    account: string;
    username: string;
    password: string;
  };
};
