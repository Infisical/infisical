import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TPamProjectRecordingConfigDALFactory = ReturnType<typeof pamProjectRecordingConfigDALFactory>;

export const pamProjectRecordingConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamProjectRecordingConfig);

  const findByProjectId = async (projectId: string) => {
    return db.replicaNode()(TableName.PamProjectRecordingConfig).where({ projectId }).first();
  };

  return { ...orm, findByProjectId };
};
