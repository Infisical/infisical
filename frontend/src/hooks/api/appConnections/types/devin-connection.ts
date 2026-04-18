import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum DevinConnectionMethod {
  ApiKey = "api-key"
}

export type TDevinConnection = TRootAppConnection & { app: AppConnection.Devin } & {
  method: DevinConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
  };
};
