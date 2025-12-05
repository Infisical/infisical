import { PamResourceType } from "../enums";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

export type TAwsIamConnectionDetails = {
  region: string;
  roleArn: string;
};

export type TAwsIamCredentials = {
  targetRoleArn: string;
  maxSessionDuration: number;
};

export type TAwsIamResource = Omit<TBasePamResource, "gatewayId"> & {
  resourceType: PamResourceType.AwsIam;
  gatewayId?: string | null;
  connectionDetails: TAwsIamConnectionDetails;
};

export type TAwsIamAccount = Omit<
  TBasePamAccount,
  "rotationEnabled" | "rotationIntervalSeconds" | "lastRotatedAt"
> & {
  credentials: TAwsIamCredentials;
};
