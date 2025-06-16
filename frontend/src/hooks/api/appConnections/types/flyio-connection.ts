import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum FlyioConnectionMethod {
  AccessToken = "access-token"
}

export type TFlyioConnection = TRootAppConnection & { app: AppConnection.Flyio } & {
  method: FlyioConnectionMethod.AccessToken;
  credentials: {
    accessToken: string;
  };
};
