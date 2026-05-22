import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum DatadogConnectionMethod {
  ApiKey = "api-key"
}

export type TDatadogConnection = TRootAppConnection & { app: AppConnection.Datadog } & {
  method: DatadogConnectionMethod.ApiKey;
  credentials: {
    url: string;
    apiKey: string;
    applicationKey: string;
  };
};
