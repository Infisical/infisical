import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TGcpServiceAccountKeyRotation = TSecretRotationV2Base & {
  type: SecretRotation.GcpServiceAccountKey;
  parameters: {
    serviceAccountEmail: string;
  };
  secretsMapping: {
    serviceAccountKey: string;
  };
};

export type TGcpServiceAccountKeyRotationGeneratedCredentials = {
  keyId: string;
  serviceAccountKey: string;
};

export type TGcpServiceAccountKeyRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.GcpServiceAccountKey,
    TGcpServiceAccountKeyRotationGeneratedCredentials
  >;

export type TGcpServiceAccountKeyRotationOption = {
  name: string;
  type: SecretRotation.GcpServiceAccountKey;
  connection: AppConnection.GCP;
  template: {
    secretsMapping: TGcpServiceAccountKeyRotation["secretsMapping"];
  };
};
