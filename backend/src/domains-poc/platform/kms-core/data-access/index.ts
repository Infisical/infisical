import { TDbClient } from "@app/db";

import { KmsKeyDataAccess, TKmsKeyDataAccess } from "./kms-key-data-access";

export type TKmsCoreDataAccess = {
  kmsKeys: TKmsKeyDataAccess;
};

export const buildKmsCoreDataAccess = (db: TDbClient): TKmsCoreDataAccess => ({
  kmsKeys: new KmsKeyDataAccess(db)
});
