import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TFireworksApiKeyRotation = TSecretRotationV2Base & {
  type: SecretRotation.FireworksApiKey;
  parameters: {
    keyName: string;
  };
  secretsMapping: {
    secretValue: string;
  };
};

export type TFireworksApiKeyRotationGeneratedCredentials = {
  secretName: string;
  secretValue: string;
};

export type TFireworksApiKeyRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.FireworksApiKey,
    TFireworksApiKeyRotationGeneratedCredentials
  >;

export type TFireworksApiKeyRotationOption = {
  name: string;
  type: SecretRotation.FireworksApiKey;
  connection: AppConnection.Fireworks;
  template: {
    secretsMapping: TFireworksApiKeyRotation["secretsMapping"];
  };
};
