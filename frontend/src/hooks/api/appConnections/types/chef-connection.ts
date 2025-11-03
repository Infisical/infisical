import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum ChefConnectionMethod {
  UserKey = "user-key"
}

export type TChefConnection = TRootAppConnection & { app: AppConnection.Chef } & {
  method: ChefConnectionMethod.UserKey;
  credentials: {
    instanceUrl?: string;
    orgName: string;
    userName: string;
    privateKey: string;
  };
};
