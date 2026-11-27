import { TDbClient } from "@app/db";
import { TableName, TAlertSlackMessages } from "@app/db/schemas";
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
      return (await db(TableName.AlertSlackMessage)
        .leftJoin(TableName.Alert, `${TableName.Alert}.id`, `${TableName.AlertSlackMessage}.alertId`)
        .leftJoin(
          TableName.AlertChannel,
          `${TableName.AlertChannel}.id`,
          `${TableName.AlertSlackMessage}.alertChannelId`
        )
        .leftJoin(TableName.AlertChannelMembership, (join) => {
          join
            .on(`${TableName.AlertChannelMembership}.alertId`, `${TableName.AlertSlackMessage}.alertId`)
            .andOn(`${TableName.AlertChannelMembership}.channelId`, `${TableName.AlertSlackMessage}.alertChannelId`);
        })
        .where(`${TableName.AlertSlackMessage}.orgId`, orgId)
        .where(`${TableName.AlertSlackMessage}.resourceType`, resourceType)
        .whereIn(`${TableName.AlertSlackMessage}.targetId`, targetIds)
        .select(
          `${TableName.AlertSlackMessage}.*`,
          db.ref("enabled").withSchema(TableName.Alert).as("alertEnabled"),
          db.ref("enabled").withSchema(TableName.AlertChannel).as("channelEnabled"),
          db.ref("encryptedConfig").withSchema(TableName.AlertChannel).as("channelEncryptedConfig"),
          db.ref("projectId").withSchema(TableName.AlertChannel).as("channelProjectId"),
          db.ref("id").withSchema(TableName.AlertChannelMembership).as("membershipId")
        )
        .orderBy(`${TableName.AlertSlackMessage}.createdAt`, "asc")) as (TAlertSlackMessages & {
        alertEnabled: boolean | null;
        channelEnabled: boolean | null;
        channelEncryptedConfig: Buffer | null;
        channelProjectId: string | null;
        membershipId: string | null;
      })[];
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
