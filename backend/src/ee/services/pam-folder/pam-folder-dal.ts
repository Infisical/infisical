import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TPamFolderDALFactory = ReturnType<typeof pamFolderDALFactory>;
export const pamFolderDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamFolder);
  return { ...orm };
};
