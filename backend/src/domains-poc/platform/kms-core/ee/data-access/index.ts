import { TDbClient } from "@app/db";

import { buildKmsCoreDataAccess, TKmsCoreDataAccess } from "../../data-access";
import { ExternalKmsDataAccess, TExternalKmsDataAccess } from "./external-kms-data-access";

export type TKmsCoreEeDataAccess = TKmsCoreDataAccess & {
  externalKms: TExternalKmsDataAccess;
};

export const buildKmsCoreEeDataAccess = (db: TDbClient): TKmsCoreEeDataAccess => ({
  ...buildKmsCoreDataAccess(db),
  externalKms: new ExternalKmsDataAccess(db)
});
