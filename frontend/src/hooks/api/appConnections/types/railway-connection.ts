import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum RailwayConnectionMethod {
  AccountToken = "account-token",
  ProjectToken = "project-token",
  TeamToken = "team-token"
}

export type TRailwayConnection = TRootAppConnection & { app: AppConnection.Railway } & {
  method: RailwayConnectionMethod;
  credentials: {
    apiToken: string;
  };
};
