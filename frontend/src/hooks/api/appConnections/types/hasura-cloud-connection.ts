import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum HasuraCloudConnectionMethod {
  AccessToken = "access-token"
}

export type THasuraCloudConnection = TRootAppConnection & { app: AppConnection.HasuraCloud } & {
  method: HasuraCloudConnectionMethod.AccessToken;
  credentials: {
    accessToken: string;
  };
};
