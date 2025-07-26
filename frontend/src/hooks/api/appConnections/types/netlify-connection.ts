import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum NetlifyConnectionMethod {
  AccessToken = "access-token"
}

export type TNetlifyConnection = TRootAppConnection & {
  app: AppConnection.Netlify;
  method: NetlifyConnectionMethod.AccessToken;
  credentials: {
    accessToken: string;
  };
};
