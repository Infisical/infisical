import { TPasswordRequirements } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export enum WindowsLocalAccountRotationMethod {
  LoginAsTarget = "login-as-target",
  LoginAsRoot = "login-as-root"
}

export type TWindowsLocalAccountRotation = TSecretRotationV2Base & {
  type: SecretRotation.WindowsLocalAccount;
  parameters: {
    username: string;
    rotationMethod?: WindowsLocalAccountRotationMethod;
    passwordRequirements?: TPasswordRequirements;
  };
  secretsMapping: {
    username: string;
    password: string;
  };
};

export type TWindowsLocalAccountRotationGeneratedCredentials = {
  username: string;
  password: string;
};

export type TWindowsLocalAccountRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.WindowsLocalAccount,
    TWindowsLocalAccountRotationGeneratedCredentials
  >;

export type TWindowsLocalAccountRotationOption = {
  name: string;
  type: SecretRotation.WindowsLocalAccount;
  connection: AppConnection.SMB;
  template: {
    secretsMapping: TWindowsLocalAccountRotation["secretsMapping"];
  };
};
