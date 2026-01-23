import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TPkiCollectionDALFactory = ReturnType<typeof pkiCollectionDALFactory>;

export const pkiCollectionDALFactory = (db: TDbClient) => {
  const pkiCollectionOrm = ormify(db, TableName.PkiCollection);

  return {
    ...pkiCollectionOrm
  };
};
