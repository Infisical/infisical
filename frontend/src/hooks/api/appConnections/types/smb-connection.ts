import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum SmbConnectionMethod {
  Credentials = "credentials"
}

export type TSmbConnection = TRootAppConnection & {
  app: AppConnection.SMB;
  method: SmbConnectionMethod.Credentials;
  credentials: {
    host: string;
    port: number;
    domain?: string;
    username: string;
  };
};
