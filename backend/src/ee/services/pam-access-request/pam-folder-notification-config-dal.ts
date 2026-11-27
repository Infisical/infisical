import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TPamFolderNotificationConfigDALFactory = ReturnType<typeof pamFolderNotificationConfigDALFactory>;

export const pamFolderNotificationConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamFolderNotificationConfig);

  const findByFolderId = async (folderId: string, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.PamFolderNotificationConfig)
        .where({ folderId })
        .select(selectAllTableCols(TableName.PamFolderNotificationConfig))
        .orderBy("createdAt", "asc");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM folder notification configs by folder ID" });
    }
  };

  return { ...orm, findByFolderId };
};
