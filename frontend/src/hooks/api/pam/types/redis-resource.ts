import { PamResourceType } from "../enums";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

export type TRedisConnectionDetails = {
  host: string;
  port: number;
  sslEnabled: boolean;
  sslRejectUnauthorized: boolean;
  sslCertificate?: string;
};

export type TRedisCredentials = {
  username: string;
  password: string;
};

// Resources
export type TRedisResource = TBasePamResource & { resourceType: PamResourceType.Redis } & {
  connectionDetails: TRedisConnectionDetails;
};

// Accounts
export type TRedisAccount = TBasePamAccount & {
  credentials: TRedisCredentials;
};
