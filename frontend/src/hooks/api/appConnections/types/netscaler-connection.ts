import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum NetScalerConnectionMethod {
  BasicAuth = "basic-auth"
}

export type TNetScalerConnection = TRootAppConnection & { app: AppConnection.NetScaler } & {
  method: NetScalerConnectionMethod.BasicAuth;
  credentials: {
    hostname: string;
    port?: number;
    username: string;
    password: string;
    sslRejectUnauthorized?: boolean;
    sslCertificate?: string;
  };
};
