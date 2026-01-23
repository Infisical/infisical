import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TIdentityGcpAuthDALFactory = ReturnType<typeof identityGcpAuthDALFactory>;

export const identityGcpAuthDALFactory = (db: TDbClient) => {
  const gcpAuthOrm = ormify(db, TableName.IdentityGcpAuth);
  return gcpAuthOrm;
};
