import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum RedfishConnectionMethod {
  BasicAuth = "basic-auth"
}

export type TRedfishConnection = TRootAppConnection & { app: AppConnection.Redfish } & {
  method: RedfishConnectionMethod.BasicAuth;
  credentials: {
    hostname: string;
    port?: number;
    username: string;
    password: string;
    sslRejectUnauthorized?: boolean;
    sslCertificate?: string;
  };
};
