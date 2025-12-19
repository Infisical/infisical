import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum OctopusDeployConnectionMethod {
  ApiKey = "api-key"
}

export type TOctopusDeployConnection = TRootAppConnection & { app: AppConnection.OctopusDeploy } & {
  method: OctopusDeployConnectionMethod.ApiKey;
  credentials: {
    instanceUrl: string;
    apiKey: string;
  };
};
