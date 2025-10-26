import { PamResourceType } from "../enums";
import { TBaseSqlConnectionDetails, TBaseSqlCredentials } from "./shared/sql-resource";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

// Resources
export type TPostgresResource = TBasePamResource & { resourceType: PamResourceType.Postgres } & {
  connectionDetails: TBaseSqlConnectionDetails;
  rotationAccountCredentials?: TBaseSqlCredentials | null;
};

// Accounts
export type TPostgresAccount = TBasePamAccount & {
  credentials: TBaseSqlCredentials;
};
