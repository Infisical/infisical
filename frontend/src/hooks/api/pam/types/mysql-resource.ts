import { PamResourceType } from "../enums";
import { TBaseSqlConnectionDetails, TBaseSqlCredentials } from "./shared/sql-resource";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

// Resources
export type TMySQLResource = TBasePamResource & { resourceType: PamResourceType.MySQL } & {
  connectionDetails: TBaseSqlConnectionDetails;
};

// Accounts
export type TMySQLAccount = TBasePamAccount & {
  gatewayId?: string;
  credentials: TBaseSqlCredentials;
};
