import { PamResourceType } from "../enums";
import { TBaseSqlConnectionDetails, TBaseSqlCredentials } from "./shared/sql-resource";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

export type TPostgresConnectionDetails = TBaseSqlConnectionDetails & {
  // Optional branch identifier required by branch-aware Postgres providers (e.g. PlanetScale).
  // When set, the backend appends it to the connection username as `<user>.<branch>` so the
  // provider's proxy can route to the correct branch.
  branch?: string;
};

// Resources
export type TPostgresResource = TBasePamResource & { resourceType: PamResourceType.Postgres } & {
  connectionDetails: TPostgresConnectionDetails;
  rotationAccountCredentials?: TBaseSqlCredentials | null;
};

// Accounts
export type TPostgresAccount = TBasePamAccount & {
  credentials: TBaseSqlCredentials;
};
