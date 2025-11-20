import { PamResourceType } from "../enums";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

export enum SSHAuthMethod {
  Password = "password",
  PublicKey = "public-key",
  Certificate = "certificate"
}

export type TSSHConnectionDetails = {
  host: string;
  port: number;
};

export type TSSHPasswordCredentials = {
  authMethod: SSHAuthMethod.Password;
  username: string;
  password: string;
};

export type TSSHPublicKeyCredentials = {
  authMethod: SSHAuthMethod.PublicKey;
  username: string;
  privateKey: string;
};

export type TSSHCertificateCredentials = {
  authMethod: SSHAuthMethod.Certificate;
  username: string;
};

export type TSSHCredentials =
  | TSSHPasswordCredentials
  | TSSHPublicKeyCredentials
  | TSSHCertificateCredentials;

// Resources
export type TSSHResource = TBasePamResource & { resourceType: PamResourceType.SSH } & {
  connectionDetails: TSSHConnectionDetails;
  rotationAccountCredentials?: TSSHCredentials | null;
};

// Accounts
export type TSSHAccount = TBasePamAccount & {
  credentials: TSSHCredentials;
};
