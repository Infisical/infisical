import { PamResourceType } from "../enums";
import { TBaseSqlConnectionDetails, TBaseSqlCredentials } from "./shared/sql-resource";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

// Resources
export type TMsSQLResource = TBasePamResource & { resourceType: PamResourceType.MsSQL } & {
  connectionDetails: TBaseSqlConnectionDetails;
};

// Accounts
export type TMsSQLAccount = TBasePamAccount & {
  credentials: TBaseSqlCredentials;
};
