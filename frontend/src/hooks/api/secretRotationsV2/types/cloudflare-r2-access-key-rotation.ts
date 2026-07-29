import {
  CloudflareR2AccessLevel,
  TCloudflareR2BucketSelection
} from "@app/components/secret-rotations-v2/forms/schemas/cloudflare-r2-access-key-rotation-schema";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TCloudflareR2AccessKeyRotation = TSecretRotationV2Base & {
  type: SecretRotation.CloudflareR2AccessKey;
  parameters: {
    name: string;
    buckets: TCloudflareR2BucketSelection[];
    accessLevel: CloudflareR2AccessLevel;
    allowedIps?: string[];
    disallowedIps?: string[];
  };
  secretsMapping: {
    apiToken: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
};

export type TCloudflareR2AccessKeyRotationGeneratedCredentials = {
  apiToken: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type TCloudflareR2AccessKeyRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.CloudflareR2AccessKey,
    TCloudflareR2AccessKeyRotationGeneratedCredentials
  >;

export type TCloudflareR2AccessKeyRotationOption = {
  name: string;
  type: SecretRotation.CloudflareR2AccessKey;
  connection: AppConnection.Cloudflare;
  template: {
    secretsMapping: TCloudflareR2AccessKeyRotation["secretsMapping"];
  };
};
