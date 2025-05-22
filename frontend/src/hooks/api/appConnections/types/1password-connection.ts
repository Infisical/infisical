import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum OnePassConnectionMethod {
  ApiToken = "api-token"
}

export type TOnePassConnection = TRootAppConnection & { app: AppConnection.OnePass } & {
  method: OnePassConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
    instanceUrl: string;
  };
};
