import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum TriggerDevConnectionMethod {
  ApiKey = "api-key"
}

export type TTriggerDevConnection = TRootAppConnection & { app: AppConnection.TriggerDev } & {
  method: TriggerDevConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
    instanceUrl?: string;
  };
};
