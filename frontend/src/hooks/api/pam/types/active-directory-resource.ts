import { PamResourceType } from "../enums";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

export enum ActiveDirectoryAccountType {
  User = "user",
  Service = "service"
}

export type TActiveDirectoryConnectionDetails = {
  domain: string;
  dcAddress: string;
  port: number;
};

export type TActiveDirectoryCredentials = {
  username: string;
  password: string;
};

export type TActiveDirectoryAccountMetadata = {
  accountType: ActiveDirectoryAccountType;
};

// Resources
export type TActiveDirectoryResource = TBasePamResource & {
  resourceType: PamResourceType.ActiveDirectory;
} & {
  connectionDetails: TActiveDirectoryConnectionDetails;
  rotationAccountCredentials?: TActiveDirectoryCredentials | null;
};

// Accounts
export type TActiveDirectoryAccount = TBasePamAccount & {
  credentials: TActiveDirectoryCredentials;
  metadata: TActiveDirectoryAccountMetadata;
};
