import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum PortainerConnectionMethod {
  ApiToken = "api-token"
}

export type TPortainerConnection = TRootAppConnection & { app: AppConnection.Portainer } & {
  method: PortainerConnectionMethod.ApiToken;
  credentials: {
    instanceUrl: string;
    apiToken: string;
  };
};
