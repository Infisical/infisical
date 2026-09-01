import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum WinRMConnectionMethod {
  UsernamePassword = "username-password"
}

export type TWinRMConnection = TRootAppConnection & { app: AppConnection.WinRM } & {
  method: WinRMConnectionMethod.UsernamePassword;
  credentials: {
    host: string;
    port?: number;
    username: string;
    password: string;
    sslEnabled?: boolean;
    sslRejectUnauthorized?: boolean;
    sslCertificate?: string;
  };
};
