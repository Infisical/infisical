import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TOpenAIServiceAccountRotation = TSecretRotationV2Base & {
  type: SecretRotation.OpenAIServiceAccount;
  parameters: {
    projectId: string;
    name: string;
  };
  secretsMapping: {
    apiKey: string;
  };
};

export type TOpenAIServiceAccountRotationGeneratedCredentials = {
  apiKey: string;
  serviceAccountId: string;
};

export type TOpenAIServiceAccountRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.OpenAIServiceAccount,
    TOpenAIServiceAccountRotationGeneratedCredentials
  >;

export type TOpenAIServiceAccountRotationOption = {
  name: string;
  type: SecretRotation.OpenAIServiceAccount;
  connection: AppConnection.OpenAI;
  template: {
    secretsMapping: TOpenAIServiceAccountRotation["secretsMapping"];
  };
};
