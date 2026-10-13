import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum HpeIloConnectionMethod {
  BasicAuth = "basic-auth"
}

export type THpeIloConnection = TRootAppConnection & { app: AppConnection.HpeIloRedFish } & {
  method: HpeIloConnectionMethod.BasicAuth;
  credentials: {
    hostname: string;
    port?: number;
    username: string;
    password: string;
    sslRejectUnauthorized?: boolean;
    sslCertificate?: string;
  };
};
