import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum QoveryConnectionMethod {
  AccessToken = "access-token"
}

export type TQoveryConnection = TRootAppConnection & { app: AppConnection.Qovery } & {
  method: QoveryConnectionMethod.AccessToken;
  credentials: {
    accessToken: string;
    instanceUrl?: string;
  };
};
