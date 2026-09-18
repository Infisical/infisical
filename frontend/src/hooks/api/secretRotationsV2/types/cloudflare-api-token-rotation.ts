import { TCloudflareApiTokenPolicyStored } from "@app/components/secret-rotations-v2/forms/schemas/cloudflare-api-token-rotation-schema";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TCloudflareApiTokenPolicy = TCloudflareApiTokenPolicyStored;

export type TCloudflareApiTokenRotation = TSecretRotationV2Base & {
  type: SecretRotation.CloudflareApiToken;
  parameters: {
    name: string;
    policies: TCloudflareApiTokenPolicy[];
    allowedIps?: string[];
    disallowedIps?: string[];
  };
  secretsMapping: {
    tokenId: string;
    apiToken: string;
  };
};

export type TCloudflareApiTokenRotationGeneratedCredentials = {
  tokenId: string;
  apiToken: string;
};

export type TCloudflareApiTokenRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.CloudflareApiToken,
    TCloudflareApiTokenRotationGeneratedCredentials
  >;

export type TCloudflareApiTokenRotationOption = {
  name: string;
  type: SecretRotation.CloudflareApiToken;
  connection: AppConnection.Cloudflare;
  template: {
    secretsMapping: TCloudflareApiTokenRotation["secretsMapping"];
  };
};
