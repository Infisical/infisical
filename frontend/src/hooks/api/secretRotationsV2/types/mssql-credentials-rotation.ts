import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase,
  TSqlCredentialsRotationGeneratedCredentials,
  TSqlCredentialsRotationProperties
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TMsSqlCredentialsRotation = TSecretRotationV2Base & {
  type: SecretRotation.MsSqlCredentials;
} & TSqlCredentialsRotationProperties;

export type TMsSqlCredentialsRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.MsSqlCredentials,
    TSqlCredentialsRotationGeneratedCredentials
  >;
