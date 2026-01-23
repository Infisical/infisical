import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TIdentityOciAuthDALFactory = ReturnType<typeof identityOciAuthDALFactory>;

export const identityOciAuthDALFactory = (db: TDbClient) => {
  return ormify(db, TableName.IdentityOciAuth);
};
