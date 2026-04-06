import { PamResourceType } from "../enums";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

export type TMongoDBConnectionDetails = {
  host: string;
  database: string;
  sslEnabled: boolean;
  sslRejectUnauthorized: boolean;
  sslCertificate?: string;
};

export type TMongoDBCredentials = {
  username: string;
  password: string;
};

// Resources
export type TMongoDBResource = TBasePamResource & { resourceType: PamResourceType.MongoDB } & {
  connectionDetails: TMongoDBConnectionDetails;
};

// Accounts
export type TMongoDBAccount = TBasePamAccount & {
  credentials: TMongoDBCredentials;
};
