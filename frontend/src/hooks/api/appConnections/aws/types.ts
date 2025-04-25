import { SecretSync } from "@app/hooks/api/secretSyncs";

export type TListAwsConnectionKmsKeys = {
  connectionId: string;
  region: string;
  destination: SecretSync.AWSParameterStore | SecretSync.AWSSecretsManager;
};

export type TAwsConnectionKmsKey = {
  alias: string;
  id: string;
};

export type TAwsConnectionListKmsKeysResponse = {
  kmsKeys: TAwsConnectionKmsKey[];
};

export type TListAwsConnectionIamUsers = {
  connectionId: string;
};

export type TAwsConnectionIamUser = {
  arn: string;
  UserName: string;
};

export type TAwsConnectionListIamUsersResponse = {
  iamUsers: TAwsConnectionIamUser[];
};

export type TAwsIamUserSecret = TAwsConnectionIamUser;
