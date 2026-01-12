import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum TriggerDevConnectionMethod {
  ApiToken = "api-token"
}

export type TTriggerDevConnection = TRootAppConnection & {
  app: AppConnection.TriggerDev;
  method: TriggerDevConnectionMethod.ApiToken;
  credentials: {
    apiToken: string;
    apiUrl?: string;
  };
};
