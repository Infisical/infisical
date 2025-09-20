import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum RedisConnectionMethod {
  UsernameAndPassword = "username-and-password"
}

export type TRedisConnectionCredentials = {
  host: string;
  port: number;
  username: string;
  password?: string;
  sslEnabled: boolean;
  sslRejectUnauthorized: boolean;
  sslCertificate?: string;
};

export type TRedisConnection = TRootAppConnection & { app: AppConnection.Redis } & {
  method: RedisConnectionMethod.UsernameAndPassword;
  credentials: TRedisConnectionCredentials;
};
