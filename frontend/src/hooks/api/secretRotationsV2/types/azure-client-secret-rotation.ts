import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TAzureClientSecretRotation = TSecretRotationV2Base & {
  type: SecretRotation.AzureClientSecret;
  parameters: {
    objectId: string;
    appName: string;
  };
  secretsMapping: {
    clientId: string;
    clientSecret: string;
  };
};

export type TAzureClientSecretRotationGeneratedCredentials = {
  clientId: string;
  clientSecret: string;
};

export type TAzureClientSecretRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.AzureClientSecret,
    TAzureClientSecretRotationGeneratedCredentials
  >;

export type TAzureClientSecretRotationOption = {
  name: string;
  type: SecretRotation.AzureClientSecret;
  connection: AppConnection.AzureClientSecrets;
  template: {
    secretsMapping: TAzureClientSecretRotation["secretsMapping"];
  };
};
