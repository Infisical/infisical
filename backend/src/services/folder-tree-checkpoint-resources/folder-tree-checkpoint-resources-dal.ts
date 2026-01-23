import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TFolderTreeCheckpointResources } from "@app/db/schemas/folder-tree-checkpoint-resources";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols } from "@app/lib/knex";

export type TFolderTreeCheckpointResourcesDALFactory = ReturnType<typeof folderTreeCheckpointResourcesDALFactory>;

type TFolderTreeCheckpointResourcesWithCommitId = TFolderTreeCheckpointResources & {
  commitId: bigint;
};

export const folderTreeCheckpointResourcesDALFactory = (db: TDbClient) => {
  const folderTreeCheckpointResourcesOrm = ormify(db, TableName.FolderTreeCheckpointResources);

  const findByTreeCheckpointId = async (
    folderTreeCheckpointId: string,
    tx?: Knex
  ): Promise<TFolderTreeCheckpointResourcesWithCommitId[]> => {
    try {
      const docs = await (tx || db.replicaNode())<TFolderTreeCheckpointResources>(
        TableName.FolderTreeCheckpointResources
      )
        .join(
          TableName.FolderCommit,
          `${TableName.FolderTreeCheckpointResources}.folderCommitId`,
          `${TableName.FolderCommit}.id`
        )
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ folderTreeCheckpointId }, TableName.FolderTreeCheckpointResources))
        .select(selectAllTableCols(TableName.FolderTreeCheckpointResources))
        .select(db.ref("commitId").withSchema(TableName.FolderCommit).as("commitId"));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByTreeCheckpointId" });
    }
  };

  return {
    ...folderTreeCheckpointResourcesOrm,
    findByTreeCheckpointId
  };
};
