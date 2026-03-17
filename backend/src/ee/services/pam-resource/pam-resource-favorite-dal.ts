import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TPamResourceFavoriteDALFactory = ReturnType<typeof pamResourceFavoriteDALFactory>;

export const pamResourceFavoriteDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamResourceFavorite);

  return { ...orm };
};
