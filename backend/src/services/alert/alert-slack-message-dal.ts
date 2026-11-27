import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAlertSlackMessageDALFactory = ReturnType<typeof alertSlackMessageDALFactory>;

export const alertSlackMessageDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AlertSlackMessage);

  const findByTargets = async ({
    orgId,
    resourceType,
    targetIds
  }: {
    orgId: string;
    resourceType: string;
    targetIds: string[];
  }) => {
    try {
      return await db(TableName.AlertSlackMessage)
        .where({ orgId, resourceType })
        .whereIn("targetId", targetIds)
        .orderBy("createdAt", "asc");
    } catch (error) {
      throw new DatabaseError({ error, name: "FindAlertSlackMessagesByTargets" });
    }
  };

  const deleteCreatedBefore = async (before: Date) => {
    try {
      return await db(TableName.AlertSlackMessage).where("createdAt", "<", before).delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteAlertSlackMessagesCreatedBefore" });
    }
  };

  return { ...orm, findByTargets, deleteCreatedBefore };
};
