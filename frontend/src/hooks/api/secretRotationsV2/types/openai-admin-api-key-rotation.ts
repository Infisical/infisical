import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TOpenAIAdminApiKeyRotation = TSecretRotationV2Base & {
  type: SecretRotation.OpenAIAdminApiKey;
  parameters: {
    name: string;
  };
  secretsMapping: {
    apiKey: string;
  };
};

export type TOpenAIAdminApiKeyRotationGeneratedCredentials = {
  apiKey: string;
  keyId: string;
};

export type TOpenAIAdminApiKeyRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.OpenAIAdminApiKey,
    TOpenAIAdminApiKeyRotationGeneratedCredentials
  >;

export type TOpenAIAdminApiKeyRotationOption = {
  name: string;
  type: SecretRotation.OpenAIAdminApiKey;
  connection: AppConnection.OpenAI;
  template: {
    secretsMapping: TOpenAIAdminApiKeyRotation["secretsMapping"];
  };
};
