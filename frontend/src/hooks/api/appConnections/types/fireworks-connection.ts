import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum FireworksConnectionMethod {
  ApiKey = "api-key"
}

export type TFireworksConnection = TRootAppConnection & { app: AppConnection.Fireworks } & {
  method: FireworksConnectionMethod.ApiKey;
  credentials: {
    accountId: string;
    apiKey: string;
  };
};
