import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TLiteLLMApiKeyRotation = TSecretRotationV2Base & {
  type: SecretRotation.LiteLLMApiKey;
  parameters: {
    name: string;
    additionalOptions?: string;
    userId?: string;
    teamId?: string;
    models?: string[];
  };
  secretsMapping: {
    apiKey: string;
  };
};

export type TLiteLLMApiKeyRotationGeneratedCredentials = {
  apiKey: string;
};

export type TLiteLLMApiKeyRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.LiteLLMApiKey,
    TLiteLLMApiKeyRotationGeneratedCredentials
  >;

export type TLiteLLMApiKeyRotationOption = {
  name: string;
  type: SecretRotation.LiteLLMApiKey;
  connection: AppConnection.LiteLLM;
  template: {
    secretsMapping: TLiteLLMApiKeyRotation["secretsMapping"];
  };
};
