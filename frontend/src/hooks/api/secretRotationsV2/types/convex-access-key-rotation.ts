import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TConvexAccessKeyRotation = TSecretRotationV2Base & {
  type: SecretRotation.ConvexAccessKey;
  parameters: {
    namePrefix: string;
  };
  secretsMapping: {
    accessKey: string;
  };
};

export type TConvexAccessKeyRotationGeneratedCredentials = {
  accessKeyId: string;
  accessKey: string;
};

export type TConvexAccessKeyRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.ConvexAccessKey,
    TConvexAccessKeyRotationGeneratedCredentials
  >;

export type TConvexAccessKeyRotationOption = {
  name: string;
  type: SecretRotation.ConvexAccessKey;
  connection: AppConnection.Convex;
  template: {
    secretsMapping: TConvexAccessKeyRotation["secretsMapping"];
  };
};
