import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify, TOrmify } from "@app/lib/knex";

export type TIdentityTlsCertAuthDALFactory = TOrmify<TableName.IdentityTlsCertAuth>;

export const identityTlsCertAuthDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.IdentityTlsCertAuth);
  return orm;
};
