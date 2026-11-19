import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum PaloAltoNetworksConnectionMethod {
  BasicAuth = "basic-auth"
}

export type TPaloAltoNetworksConnection = TRootAppConnection & {
  app: AppConnection.PaloAltoNetworks;
} & {
  method: PaloAltoNetworksConnectionMethod.BasicAuth;
  credentials: {
    hostname: string;
    port?: number;
    username: string;
    password: string;
    sslRejectUnauthorized?: boolean;
    sslCertificate?: string;
  };
};
