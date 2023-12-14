import { TDbClient } from "@app/db";
import { TableName,TProjectKeys } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TProjectKeyDalFactory = ReturnType<typeof projectKeyDalFactory>;

export const projectKeyDalFactory = (db: TDbClient) => {
  const projectKeyOrm = ormify(db, TableName.ProjectKeys);

  const findLatestProjectKey = async (
    userId: string,
    projectId: string
  ): Promise<TProjectKeys & { sender: { publicKey: string } }> => {
    try {
      const projectKey = await db(TableName.ProjectKeys)
        .where({ projectId, receiverId: userId })
        .join(TableName.Users, `${TableName.ProjectKeys}.senderId`, `${TableName.Users}.id`)
        .join(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .orderBy("createdAt", "desc", "last")
        .select(`${TableName.ProjectKeys}.*`, `${TableName.UserEncryptionKey}.publicKey`)
        .first();
      if (projectKey) {
        projectKey.sender = {
          publicKey: projectKey.publicKey
        };
      }
      return projectKey;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find latest project key" });
    }
  };

  return {
    ...projectKeyOrm,
    findLatestProjectKey
  };
};
