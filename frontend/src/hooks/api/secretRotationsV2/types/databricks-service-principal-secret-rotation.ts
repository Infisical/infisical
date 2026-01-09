import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TDatabricksServicePrincipalSecretRotation = TSecretRotationV2Base & {
  type: SecretRotation.DatabricksServicePrincipalSecret;
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

export type TDatabricksServicePrincipalSecretRotationGeneratedCredentials = {
  clientId: string;
  clientSecret: string;
};

export type TDatabricksServicePrincipalSecretRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.DatabricksServicePrincipalSecret,
    TDatabricksServicePrincipalSecretRotationGeneratedCredentials
  >;

export type TDatabricksServicePrincipalSecretRotationOption = {
  name: string;
  type: SecretRotation.DatabricksServicePrincipalSecret;
  connection: AppConnection.Databricks;
  template: {
    secretsMapping: TDatabricksServicePrincipalSecretRotation["secretsMapping"];
  };
};
