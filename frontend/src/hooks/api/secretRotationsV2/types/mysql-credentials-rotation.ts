import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase,
  TSqlCredentialsRotationGeneratedCredentials,
  TSqlCredentialsRotationProperties
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TMySqlCredentialsRotation = TSecretRotationV2Base & {
  type: SecretRotation.MySqlCredentials;
} & TSqlCredentialsRotationProperties;

export type TMySqlCredentialsRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.MySqlCredentials,
    TSqlCredentialsRotationGeneratedCredentials
  >;
