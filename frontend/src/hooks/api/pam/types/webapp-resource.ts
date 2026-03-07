import { PamResourceType } from "../enums";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

export type TWebAppConnectionDetails = {
  url: string;
};

export type TWebAppCredentials = Record<string, never>;

// Resources
export type TWebAppResource = TBasePamResource & { resourceType: PamResourceType.WebApp } & {
  connectionDetails: TWebAppConnectionDetails;
};

// Accounts
export type TWebAppAccount = TBasePamAccount & {
  credentials: TWebAppCredentials;
};
