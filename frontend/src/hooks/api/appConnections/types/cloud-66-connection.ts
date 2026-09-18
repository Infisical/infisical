import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum Cloud66ConnectionMethod {
  AccessToken = "access-token"
}

export type TCloud66Connection = TRootAppConnection & { app: AppConnection.Cloud66 } & {
  method: Cloud66ConnectionMethod.AccessToken;
  credentials: {
    accessToken: string;
  };
};
