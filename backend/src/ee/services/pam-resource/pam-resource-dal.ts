import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TPamResourceDALFactory = ReturnType<typeof pamResourceDALFactory>;
export const pamResourceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamResource);
  return { ...orm };
};
