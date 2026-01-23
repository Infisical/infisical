import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TUserAliasDALFactory = ReturnType<typeof userAliasDALFactory>;

export const userAliasDALFactory = (db: TDbClient) => {
  const userAliasOrm = ormify(db, TableName.UserAliases);

  return {
    ...userAliasOrm
  };
};
