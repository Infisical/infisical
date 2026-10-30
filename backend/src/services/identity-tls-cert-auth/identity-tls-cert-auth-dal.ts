import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityTlsCertAuthDALFactory = ReturnType<typeof identityTlsCertAuthDALFactory>;

export const identityTlsCertAuthDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.IdentityTlsCertAuth);
  return { ...orm, primaryNode: () => db.primaryNode() };
};
