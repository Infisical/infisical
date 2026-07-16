import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum GoDaddyConnectionMethod {
  ApiKey = "api-key"
}

export type TGoDaddyConnection = TRootAppConnection & { app: AppConnection.GoDaddy } & {
  method: GoDaddyConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
    apiSecret: string;
  };
};
