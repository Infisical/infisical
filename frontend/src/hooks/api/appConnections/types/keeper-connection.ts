import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum KeeperConnectionMethod {
  ApiKey = "api-key"
}

export type TKeeperConnection = TRootAppConnection & { app: AppConnection.Keeper } & {
  method: KeeperConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
    instanceUrl: string;
  };
};
