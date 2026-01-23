import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TPkiSubscriberDALFactory = ReturnType<typeof pkiSubscriberDALFactory>;

export const pkiSubscriberDALFactory = (db: TDbClient) => {
  const pkiSubscriberOrm = ormify(db, TableName.PkiSubscriber);
  return pkiSubscriberOrm;
};
