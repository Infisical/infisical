import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export enum SupabaseApiKeyType {
  Publishable = "publishable",
  Secret = "secret"
}

export type TSupabaseApiKeyRotation = TSecretRotationV2Base & {
  type: SecretRotation.SupabaseApiKey;
  parameters: {
    projectRef: string;
    keyType: SupabaseApiKeyType;
  };
  secretsMapping: {
    apiKey: string;
  };
};

export type TSupabaseApiKeyRotationGeneratedCredentials = {
  apiKey: string;
  keyId: string;
};

export type TSupabaseApiKeyRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.SupabaseApiKey,
    TSupabaseApiKeyRotationGeneratedCredentials
  >;

export type TSupabaseApiKeyRotationOption = {
  name: string;
  type: SecretRotation.SupabaseApiKey;
  connection: AppConnection.Supabase;
  template: {
    secretsMapping: TSupabaseApiKeyRotation["secretsMapping"];
  };
};
