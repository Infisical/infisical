import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TPamFolderNotificationConfigDALFactory = ReturnType<typeof pamFolderNotificationConfigDALFactory>;

export const pamFolderNotificationConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamFolderNotificationConfig);

  const findByFolderIdWithIntegration = async (folderId: string, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.PamFolderNotificationConfig)
        .join(
          TableName.WorkflowIntegrations,
          `${TableName.PamFolderNotificationConfig}.workflowIntegrationId`,
          `${TableName.WorkflowIntegrations}.id`
        )
        .select(selectAllTableCols(TableName.PamFolderNotificationConfig))
        .select(db.ref("integration").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("slug").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("status").withSchema(TableName.WorkflowIntegrations))
        .select(db.ref("orgId").withSchema(TableName.WorkflowIntegrations))
        .where(`${TableName.PamFolderNotificationConfig}.folderId`, folderId)
        .orderBy(`${TableName.PamFolderNotificationConfig}.createdAt`, "asc");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM folder notification configs by folder ID" });
    }
  };

  return { ...orm, findByFolderIdWithIntegration };
};
