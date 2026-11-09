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

export type TGetAwsProvisioningTemplate = {
  projectId?: string | null;
  partition: string;
  region: string;
  useCases: string[];
  roleName?: string;
  stackName?: string;
};

export type TAwsProvisioningTemplate = {
  kind: "cloudformation-launch";
  launchUrl: string;
  templateUrl: string;
  stackName: string;
  region: string;
  partition: string;
  templateVersion: string;
  parameters: Record<string, string>;
  outputKey: string;
};

export type TAwsProvisioningTemplateResponse = {
  provisioningTemplate: TAwsProvisioningTemplate | null;
};
