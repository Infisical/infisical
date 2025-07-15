import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum ChecklyConnectionMethod {
  ApiKey = "api-key"
}

export type TChecklyConnection = TRootAppConnection & {
  app: AppConnection.Checkly;
  method: ChecklyConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
  };
};
