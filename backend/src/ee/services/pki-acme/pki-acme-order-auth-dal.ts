import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TPkiAcmeOrderAuthDALFactory = ReturnType<typeof pkiAcmeOrderAuthDALFactory>;

export const pkiAcmeOrderAuthDALFactory = (db: TDbClient) => {
  const pkiAcmeOrderAuthOrm = ormify(db, TableName.PkiAcmeOrderAuth);

  return {
    ...pkiAcmeOrderAuthOrm
  };
};
