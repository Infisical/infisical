import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TAuth0ClientSecretRotation = TSecretRotationV2Base & {
  type: SecretRotation.Auth0ClientSecret;
  parameters: {
    clientId: string;
  };
  secretsMapping: {
    clientId: string;
    clientSecret: string;
  };
};

export type TAuth0ClientSecretRotationGeneratedCredentials = {
  clientId: string;
  clientSecret: string;
};

export type TAuth0ClientSecretRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.Auth0ClientSecret,
    TAuth0ClientSecretRotationGeneratedCredentials
  >;

export type TAuth0ClientSecretRotationOption = {
  name: string;
  type: SecretRotation.Auth0ClientSecret;
  connection: AppConnection.Auth0;
  template: {
    secretsMapping: TAuth0ClientSecretRotation["secretsMapping"];
  };
};
