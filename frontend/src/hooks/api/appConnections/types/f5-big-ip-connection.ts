import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum F5BigIpConnectionMethod {
  BasicAuth = "basic-auth"
}

export type TF5BigIpConnection = TRootAppConnection & { app: AppConnection.F5BigIp } & {
  method: F5BigIpConnectionMethod.BasicAuth;
  credentials: {
    hostname: string;
    port?: number;
    username: string;
    password: string;
    sslRejectUnauthorized?: boolean;
    sslCertificate?: string;
  };
};
