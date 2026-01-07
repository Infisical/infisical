import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TDatabricksServiceAccountSecretRotation = TSecretRotationV2Base & {
  type: SecretRotation.DatabricksServiceAccountSecret;
  parameters: {
    servicePrincipalId: string;
    servicePrincipalName?: string;
    clientId?: string;
  };
  secretsMapping: {
    clientId: string;
    clientSecret: string;
  };
};

export type TDatabricksServiceAccountSecretRotationGeneratedCredentials = {
  clientId: string;
  clientSecret: string;
};

export type TDatabricksServiceAccountSecretRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.DatabricksServiceAccountSecret,
    TDatabricksServiceAccountSecretRotationGeneratedCredentials
  >;

export type TDatabricksServiceAccountSecretRotationOption = {
  name: string;
  type: SecretRotation.DatabricksServiceAccountSecret;
  connection: AppConnection.Databricks;
  template: {
    secretsMapping: TDatabricksServiceAccountSecretRotation["secretsMapping"];
  };
};
