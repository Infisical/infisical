import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TKmipClientDALFactory = ReturnType<typeof kmipClientDALFactory>;

export const kmipClientDALFactory = (db: TDbClient) => {
  const kmipClient = ormify(db, TableName.KmipClient);

  return kmipClient;
};
