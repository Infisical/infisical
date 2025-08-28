import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TAzureCertificateRotation = TSecretRotationV2Base & {
  type: SecretRotation.AzureCertificate;
  parameters: {
    objectId: string;
    appName?: string;
  };
  secretsMapping: {
    publicKey: string;
    privateKey: string;
  };
};

export type TAzureCertificateRotationGeneratedCredentials = {
  publicKey: string;
  privateKey: string;
};

export type TAzureCertificateRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.AzureCertificate,
    TAzureCertificateRotationGeneratedCredentials
  >;

export type TAzureCertificateRotationOption = {
  name: string;
  type: SecretRotation.AzureCertificate;
  connection: AppConnection.AzureCertificate;
  template: {
    secretsMapping: TAzureCertificateRotation["secretsMapping"];
  };
};
