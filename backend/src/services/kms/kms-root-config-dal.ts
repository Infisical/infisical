import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TKmsRootConfigDALFactory = ReturnType<typeof kmsRootConfigDALFactory>;

export const kmsRootConfigDALFactory = (db: TDbClient) => {
  const kmsOrm = ormify(db, TableName.KmsServerRootConfig);
  return kmsOrm;
};
