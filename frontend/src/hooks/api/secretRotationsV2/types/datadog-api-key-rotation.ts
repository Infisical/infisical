import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TDatadogApiKeyRotation = TSecretRotationV2Base & {
  type: SecretRotation.DatadogApiKey;
  parameters: {
    name: string;
  };
  secretsMapping: {
    apiKeyId: string;
    apiKey: string;
  };
};

export type TDatadogApiKeyRotationGeneratedCredentials = {
  apiKeyId: string;
  apiKey: string;
};

export type TDatadogApiKeyRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.DatadogApiKey,
    TDatadogApiKeyRotationGeneratedCredentials
  >;

export type TDatadogApiKeyRotationOption = {
  name: string;
  type: SecretRotation.DatadogApiKey;
  connection: AppConnection.Datadog;
  template: {
    secretsMapping: TDatadogApiKeyRotation["secretsMapping"];
  };
};
