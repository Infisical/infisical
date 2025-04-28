import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TAwsIamUserSecretRotation = TSecretRotationV2Base & {
  type: SecretRotation.AwsIamUserSecret;
  parameters: {
    region?: string;
    userName: string;
  };
  secretsMapping: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};

export type TAwsIamUserSecretRotationGeneratedCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
};

export type TAwsIamUserSecretRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.AwsIamUserSecret,
    TAwsIamUserSecretRotationGeneratedCredentials
  >;

export type TAwsIamUserSecretRotationOption = {
  name: string;
  type: SecretRotation.AwsIamUserSecret;
  connection: AppConnection.AWS;
  template: {
    secretsMapping: TAwsIamUserSecretRotation["secretsMapping"];
  };
};
