import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum AwsConnectionMethod {
  AssumeRole = "assume-role",
  AccessKey = "access-key"
}

export type TAwsConnectionProvisioning = {
  launchMethod: "launch-stack";
  useCases: string[];
  stackName: string;
  partition: string;
  templateVersion: string;
  region?: string;
  roleName?: string;
};

export type TAwsConnection = TRootAppConnection & {
  app: AppConnection.AWS;
  configuration?: { provisioning?: TAwsConnectionProvisioning | null };
} & (
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
          stsEndpoint?: string;
        };
      }
  );
