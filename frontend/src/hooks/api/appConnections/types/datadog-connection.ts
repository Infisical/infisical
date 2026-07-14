import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum DatadogConnectionMethod {
  Token = "token",
  ApplicationKey = "application-key"
}

export type TDatadogConnection = TRootAppConnection & { app: AppConnection.Datadog } & (
    | {
        method: DatadogConnectionMethod.Token;
        credentials: {
          url: string;
          token: string;
        };
      }
    | {
        method: DatadogConnectionMethod.ApplicationKey;
        credentials: {
          url: string;
          apiKey: string;
          applicationKey: string;
        };
      }
  );
