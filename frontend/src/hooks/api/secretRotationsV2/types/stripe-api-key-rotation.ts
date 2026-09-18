import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TStripeApiKeyRotation = TSecretRotationV2Base & {
  type: SecretRotation.StripeApiKey;
  parameters: {
    permissions: string[];
    connectPermissions?: string[];
  };
  secretsMapping: {
    apiKey: string;
  };
};

export type TStripeApiKeyRotationGeneratedCredentials = {
  keyId: string;
  apiKey: string;
};

export type TStripeApiKeyRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.StripeApiKey,
    TStripeApiKeyRotationGeneratedCredentials
  >;

export type TStripeApiKeyRotationOption = {
  name: string;
  type: SecretRotation.StripeApiKey;
  connection: AppConnection.Stripe;
  template: {
    secretsMapping: TStripeApiKeyRotation["secretsMapping"];
    permissions: string[];
  };
};
