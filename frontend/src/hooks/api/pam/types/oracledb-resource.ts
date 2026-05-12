import { PamResourceType } from "../enums";
import { TBaseSqlConnectionDetails, TBaseSqlCredentials } from "./shared/sql-resource";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

// Resources
export type TOracleDBResource = TBasePamResource & { resourceType: PamResourceType.OracleDB } & {
  connectionDetails: TBaseSqlConnectionDetails;
};

// Accounts
export type TOracleDBAccount = TBasePamAccount & {
  credentials: TBaseSqlCredentials;
};
