import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum RundeckConnectionMethod {
  ApiToken = "api-token"
}

export type TRundeckConnection = TRootAppConnection & { app: AppConnection.Rundeck } & {
  method: RundeckConnectionMethod.ApiToken;
  credentials: {
    instanceUrl: string;
    apiToken: string;
  };
};
