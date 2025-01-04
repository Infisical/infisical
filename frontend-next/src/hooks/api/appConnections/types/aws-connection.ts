import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AwsConnectionMethod {
  AssumeRole = "assume-role",
  AccessKey = "access-key"
}

export type TAwsConnection = TRootAppConnection & { app: AppConnection.AWS } & (
    | {
        method: AwsConnectionMethod.AccessKey;
        credentials: {
          accessKeyId: string;
          secretAccessKey: string;
        };
      }
    | {
        method: AwsConnectionMethod.AssumeRole;
        credentials: {
          roleArn: string;
        };
      }
  );
