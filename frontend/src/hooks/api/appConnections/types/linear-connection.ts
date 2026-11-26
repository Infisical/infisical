import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum LinearConnectionMethod {
  ApiKey = "api-key"
}

export type TLinearConnection = TRootAppConnection & { app: AppConnection.Linear } & {
  method: LinearConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
  };
};
