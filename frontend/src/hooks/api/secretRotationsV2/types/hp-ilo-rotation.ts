import { TPasswordRequirements } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export enum HpIloRotationMethod {
  LoginAsTarget = "login-as-target",
  LoginAsRoot = "login-as-root"
}

export type THpIloRotation = TSecretRotationV2Base & {
  type: SecretRotation.HpIloLocalAccount;
  parameters: {
    username: string;
    rotationMethod?: HpIloRotationMethod;
    passwordRequirements?: TPasswordRequirements;
  };
  secretsMapping: {
    username: string;
    password: string;
  };
};

export type THpIloRotationGeneratedCredentials = {
  username: string;
  password: string;
};

export type THpIloRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.HpIloLocalAccount,
    THpIloRotationGeneratedCredentials
  >;

export type THpIloRotationOption = {
  name: string;
  type: SecretRotation.HpIloLocalAccount;
  connection: AppConnection.SSH;
  template: {
    secretsMapping: THpIloRotation["secretsMapping"];
  };
};
