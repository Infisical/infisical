import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TPendingGroupAdditionDALFactory = ReturnType<typeof pendingGroupAdditionDALFactory>;

export const pendingGroupAdditionDALFactory = (db: TDbClient) => {
  const pendingGroupAdditionOrm = ormify(db, TableName.PendingGroupAddition);

  // special query
  const deletePendingGroupAdditionsByUserIds = async (userIds: string[], tx?: Knex) => {
    try {
      const pendingGroupAdditions = await (tx || db)(TableName.PendingGroupAddition)
        .whereIn(`${TableName.PendingGroupAddition}.userId`, userIds)
        .join(TableName.Groups, `${TableName.PendingGroupAddition}.groupId`, `${TableName.Groups}.id`)
        .join(TableName.Users, `${TableName.PendingGroupAddition}.userId`, `${TableName.Users}.id`);

      await pendingGroupAdditionOrm.delete(
        {
          $in: {
            userId: userIds
          }
        },
        tx
      );

      return pendingGroupAdditions.map(({ userId, username, groupId, orgId, name, slug, role, roleId }) => ({
        user: {
          id: userId,
          username
        },
        group: {
          id: groupId,
          orgId,
          name,
          slug,
          role,
          roleId,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Filter projects by user membership" });
    }
  };

  return {
    ...pendingGroupAdditionOrm,
    deletePendingGroupAdditionsByUserIds
  };
};
