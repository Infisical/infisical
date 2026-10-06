import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum S3CompatibleConnectionMethod {
  AccessKey = "access-key"
}

export type TS3CompatibleConnection = TRootAppConnection & { app: AppConnection.S3Compatible } & {
  method: S3CompatibleConnectionMethod.AccessKey;
  credentials: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
};
