import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TSnowflakeUserKeyPairRotation = TSecretRotationV2Base & {
  type: SecretRotation.SnowflakeUserKeyPair;
  parameters: {
    username: string;
  };
  secretsMapping: {
    privateKey: string;
    publicKey: string;
  };
};

export type TSnowflakeUserKeyPairRotationGeneratedCredentials = {
  privateKey: string;
  publicKey: string;
};

export type TSnowflakeUserKeyPairRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.SnowflakeUserKeyPair,
    TSnowflakeUserKeyPairRotationGeneratedCredentials
  >;

export type TSnowflakeUserKeyPairRotationOption = {
  name: string;
  type: SecretRotation.SnowflakeUserKeyPair;
  connection: AppConnection.Snowflake;
  template: {
    secretsMapping: TSnowflakeUserKeyPairRotation["secretsMapping"];
  };
};
