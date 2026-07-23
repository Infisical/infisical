import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum KempLoadMasterConnectionMethod {
  BasicAuth = "basic-auth"
}

export type TKempLoadMasterConnection = TRootAppConnection & {
  app: AppConnection.KempLoadMaster;
} & {
  method: KempLoadMasterConnectionMethod.BasicAuth;
  credentials: {
    hostname: string;
    port?: number;
    username: string;
    password: string;
    sslRejectUnauthorized?: boolean;
    sslCertificate?: string;
  };
};
