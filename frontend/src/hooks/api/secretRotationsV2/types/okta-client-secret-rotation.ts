import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TOktaClientSecretRotation = TSecretRotationV2Base & {
  type: SecretRotation.OktaClientSecret;
  parameters: {
    clientId: string;
  };
  secretsMapping: {
    clientId: string;
    clientSecret: string;
  };
};

export type TOktaClientSecretRotationGeneratedCredentials = {
  clientId: string;
  clientSecret: string;
};

export type TOktaClientSecretRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.OktaClientSecret,
    TOktaClientSecretRotationGeneratedCredentials
  >;

export type TOktaClientSecretRotationOption = {
  name: string;
  type: SecretRotation.OktaClientSecret;
  connection: AppConnection.Okta;
  template: {
    secretsMapping: TOktaClientSecretRotation["secretsMapping"];
  };
};
