import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TPamSessionDALFactory = ReturnType<typeof pamSessionDALFactory>;
export const pamSessionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamSession);
  return { ...orm };
};
