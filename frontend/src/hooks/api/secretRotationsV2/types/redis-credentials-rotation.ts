import { TPasswordRequirements } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TRedisCredentialsRotation = TSecretRotationV2Base & {
  type: SecretRotation.RedisCredentials;
  parameters: {
    passwordRequirements?: TPasswordRequirements;
    permissionScope?: string;
  };
  secretsMapping: {
    username: string;
    password: string;
  };
};

export type TRedisCredentialsRotationGeneratedCredentials = {
  username: string;
  password: string;
};

export type TRedisCredentialsRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.RedisCredentials,
    TRedisCredentialsRotationGeneratedCredentials
  >;

export type TRedisCredentialsRotationOption = {
  name: string;
  type: SecretRotation.RedisCredentials;
  connection: AppConnection.Redis;
  template: {
    secretsMapping: TRedisCredentialsRotation["secretsMapping"];
  };
};
