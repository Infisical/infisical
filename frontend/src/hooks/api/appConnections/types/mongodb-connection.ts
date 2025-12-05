import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum MongoDBConnectionMethod {
  UsernameAndPassword = "username-and-password"
}

export type TMongoDBConnectionCredentials = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  tlsEnabled: boolean;
  tlsRejectUnauthorized: boolean;
  tlsCertificate?: string;
};

export type TMongoDBConnection = TRootAppConnection & { app: AppConnection.MongoDB } & {
  method: MongoDBConnectionMethod.UsernameAndPassword;
  credentials: TMongoDBConnectionCredentials;
};
