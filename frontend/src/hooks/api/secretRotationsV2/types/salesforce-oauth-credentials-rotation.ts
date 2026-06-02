import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TSalesforceOauthCredentialsRotation = TSecretRotationV2Base & {
  type: SecretRotation.SalesforceOauthCredentials;
  parameters: {
    appId: string;
    appName: string;
  };
  secretsMapping: {
    consumerKey: string;
    consumerSecret: string;
  };
};

export type TSalesforceOauthCredentialsRotationGeneratedCredentials = {
  consumerKey: string;
  consumerSecret: string;
};

export type TSalesforceOauthCredentialsRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.SalesforceOauthCredentials,
    TSalesforceOauthCredentialsRotationGeneratedCredentials
  >;

export type TSalesforceOauthCredentialsRotationOption = {
  name: string;
  type: SecretRotation.SalesforceOauthCredentials;
  connection: AppConnection.Salesforce;
  template: {
    secretsMapping: TSalesforceOauthCredentialsRotation["secretsMapping"];
  };
};
