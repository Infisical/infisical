import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TIdentityJwtAuthDALFactory = ReturnType<typeof identityJwtAuthDALFactory>;

export const identityJwtAuthDALFactory = (db: TDbClient) => {
  const jwtAuthOrm = ormify(db, TableName.IdentityJwtAuth);

  return jwtAuthOrm;
};
