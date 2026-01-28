import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export enum OpenRouterLimitReset {
  Daily = "daily",
  Weekly = "weekly",
  Monthly = "monthly"
}

export type TOpenRouterApiKeyRotation = TSecretRotationV2Base & {
  type: SecretRotation.OpenRouterApiKey;
  parameters: {
    name: string;
    limit?: number | null;
    limitReset?: OpenRouterLimitReset | null;
  };
  secretsMapping: {
    apiKey: string;
  };
};

export type TOpenRouterApiKeyRotationGeneratedCredentials = {
  apiKey: string;
  keyHash: string;
};

export type TOpenRouterApiKeyRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.OpenRouterApiKey,
    TOpenRouterApiKeyRotationGeneratedCredentials
  >;

export type TOpenRouterApiKeyRotationOption = {
  name: string;
  type: SecretRotation.OpenRouterApiKey;
  connection: AppConnection.OpenRouter;
  template: {
    secretsMapping: TOpenRouterApiKeyRotation["secretsMapping"];
  };
};
