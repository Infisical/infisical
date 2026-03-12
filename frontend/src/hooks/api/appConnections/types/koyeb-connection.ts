import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum KoyebConnectionMethod {
  ApiKey = "api-key"
}

export type TKoyebConnection = TRootAppConnection & { app: AppConnection.Koyeb } & {
  method: KoyebConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
  };
};
