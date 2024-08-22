import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TProjectKeys } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TProjectKeyDALFactory = ReturnType<typeof projectKeyDALFactory>;

export const projectKeyDALFactory = (db: TDbClient) => {
  const projectKeyOrm = ormify(db, TableName.ProjectKeys);

  const findLatestProjectKey = async (
    userId: string,
    projectId: string,
    tx?: Knex
  ): Promise<(TProjectKeys & { sender: { publicKey: string } }) | undefined> => {
    try {
      const projectKey = await (tx || db.replicaNode())(TableName.ProjectKeys)
        .join(TableName.Users, `${TableName.ProjectKeys}.senderId`, `${TableName.Users}.id`)
        .join(TableName.UserEncryptionKey, `${TableName.UserEncryptionKey}.userId`, `${TableName.Users}.id`)
        .where({ projectId, receiverId: userId })
        .orderBy("createdAt", "desc", "last")
        .select(selectAllTableCols(TableName.ProjectKeys))
        .select(db.ref("publicKey").withSchema(TableName.UserEncryptionKey))
        .first();
      if (projectKey) {
        return { ...projectKey, sender: { publicKey: projectKey.publicKey } };
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Find latest project key" });
    }
  };

  const findAllProjectUserPubKeys = async (projectId: string, tx?: Knex) => {
    try {
      const pubKeys = await (tx || db.replicaNode())(TableName.ProjectMembership)
        .where({ projectId })
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
        .join(TableName.UserEncryptionKey, `${TableName.Users}.id`, `${TableName.UserEncryptionKey}.userId`)
        .select("userId", "publicKey");
      return pubKeys;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all workspace pub keys" });
    }
  };

  return {
    ...projectKeyOrm,
    findAllProjectUserPubKeys,
    findLatestProjectKey
  };
};
