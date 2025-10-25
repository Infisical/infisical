import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum NorthflankConnectionMethod {
  ApiToken = "api-token"
}

export type TNorthflankConnection = TRootAppConnection & { app: AppConnection.Northflank } & {
  method: NorthflankConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
  };
};
