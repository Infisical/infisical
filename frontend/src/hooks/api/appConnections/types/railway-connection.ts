import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum RailwayConnectionMethod {
  ApiToken = "api-token"
}

export type TRailwayConnection = TRootAppConnection & { app: AppConnection.Railway } & {
  method: RailwayConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
  };
};
