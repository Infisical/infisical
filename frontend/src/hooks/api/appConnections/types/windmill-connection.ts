import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum WindmillConnectionMethod {
  AccessToken = "access-token"
}

export type TWindmillConnection = TRootAppConnection & { app: AppConnection.Windmill } & {
  method: WindmillConnectionMethod.AccessToken;
  credentials: {
    accessToken: string;
    instanceUrl?: string;
  };
};
