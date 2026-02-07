import { PamResourceType } from "../enums";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

export enum WindowsProtocol {
  RDP = "rdp"
}

export enum WindowsAccountType {
  User = "user",
  Service = "service"
}

export type TWindowsConnectionDetails = {
  protocol: WindowsProtocol.RDP;
  hostname: string;
  port: number;
};

export type TWindowsCredentials = {
  username: string;
  password: string;
};

export type TWindowsAccountMetadata = {
  accountType: WindowsAccountType;
};

// Resources
export type TWindowsResource = TBasePamResource & {
  resourceType: PamResourceType.Windows;
} & {
  connectionDetails: TWindowsConnectionDetails;
  rotationAccountCredentials?: TWindowsCredentials | null;
};

// Accounts
export type TWindowsAccount = TBasePamAccount & {
  credentials: TWindowsCredentials;
  metadata: TWindowsAccountMetadata;
};
