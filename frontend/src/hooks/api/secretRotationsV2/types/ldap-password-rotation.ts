import { TPasswordRequirements } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import {
  TSecretRotationV2Base,
  TSecretRotationV2GeneratedCredentialsResponseBase
} from "@app/hooks/api/secretRotationsV2/types/shared";

export enum LdapPasswordRotationMethod {
  ConnectionPrincipal = "connection-principal",
  TargetPrincipal = "target-principal"
}

export type TLdapPasswordRotation = TSecretRotationV2Base & {
  type: SecretRotation.LdapPassword;
  parameters: {
    dn: string;
    rotationMethod?: LdapPasswordRotationMethod;
    passwordRequirements?: TPasswordRequirements;
  };
  secretsMapping: {
    dn: string;
    password: string;
  };
};

export type TLdapPasswordRotationGeneratedCredentials = {
  dn: string;
  password: string;
};

export type TLdapPasswordRotationGeneratedCredentialsResponse =
  TSecretRotationV2GeneratedCredentialsResponseBase<
    SecretRotation.LdapPassword,
    TLdapPasswordRotationGeneratedCredentials
  >;

export type TLdapPasswordRotationOption = {
  name: string;
  type: SecretRotation.LdapPassword;
  connection: AppConnection.LDAP;
  template: {
    secretsMapping: TLdapPasswordRotation["secretsMapping"];
  };
};
