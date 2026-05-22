import { TAwsHoneyTokenConfig, TAwsHoneyTokenConfigInput } from "../honey-token-types";

export type THoneyTokenConfigRecord = {
  id: string;
  orgId: string;
  type: string;
  connectionId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  encryptedConfig?: Buffer | null;
};

export type THoneyTokenConfigWithDecrypted = {
  id: string;
  orgId: string;
  type: string;
  connectionId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  decryptedConfig: TAwsHoneyTokenConfig | null;
};

export type TVerifyStackDeploymentInput = {
  orgId: string;
  connectionId: string;
  stackName: string;
  awsRegion: string;
};

export type TUpsertAwsHoneyTokenConfigInput = {
  orgId: string;
  connectionId: string;
  config: TAwsHoneyTokenConfigInput;
};

export type TTestAwsHoneyTokenConnectionInput = {
  orgId: string;
};

export type TGetAwsHoneyTokenConfigInput = {
  orgId: string;
};
