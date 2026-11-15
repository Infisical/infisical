import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase,
  TSqlCredentialsRotationGeneratedCredentials,
  TSqlCredentialsRotationProperties
} from "@app/hooks/api/secretRotationsV2/types/shared";

export type TClickHouseCredentialsRotation = TSecretRotationV2Base & {
  type: SecretRotation.ClickHouseCredentials;
} & TSqlCredentialsRotationProperties;

export type TClickHouseCredentialsRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.ClickHouseCredentials,
    TSqlCredentialsRotationGeneratedCredentials
  >;

export type TClickHouseCredentialsRotationOption = {
  name: string;
  type: SecretRotation.ClickHouseCredentials;
  connection: AppConnection.ClickHouse;
  template: {
    createUserStatement: string;
    secretsMapping: TClickHouseCredentialsRotation["secretsMapping"];
  };
};
