import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TDatadogApplicationKeySecretRotation = TSecretRotationV2Base & {
  type: SecretRotation.DatadogApplicationKeySecret;
  parameters: {
    serviceAccountId: string;
  };
  secretsMapping: {
    applicationKeyId: string;
    applicationKey: string;
  };
};

export type TDatadogApplicationKeySecretRotationGeneratedCredentials = {
  applicationKeyId: string;
  applicationKey: string;
};

export type TDatadogApplicationKeySecretRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.DatadogApplicationKeySecret,
    TDatadogApplicationKeySecretRotationGeneratedCredentials
  >;

export type TDatadogApplicationKeySecretRotationOption = {
  name: string;
  type: SecretRotation.DatadogApplicationKeySecret;
  connection: AppConnection.Datadog;
  template: {
    secretsMapping: TDatadogApplicationKeySecretRotation["secretsMapping"];
  };
};
