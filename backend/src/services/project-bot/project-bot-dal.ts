import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName } from "@app/db/schemas/models";
import { TProjectBots } from "@app/db/schemas/project-bots";
import { TUserEncryptionKeys } from "@app/db/schemas/user-encryption-keys";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TProjectBotDALFactory = ReturnType<typeof projectBotDALFactory>;

export const projectBotDALFactory = (db: TDbClient) => {
  const projectBotOrm = ormify(db, TableName.ProjectBot);

  const findOne = async (filter: Partial<TProjectBots>, tx?: Knex) => {
    try {
      const bot = await (tx || db.replicaNode())(TableName.ProjectBot)
        .where(filter)
        .leftJoin(TableName.Users, `${TableName.ProjectBot}.senderId`, `${TableName.Users}.id`)
        .leftJoin(TableName.UserEncryptionKey, `${TableName.UserEncryptionKey}.userId`, `${TableName.Users}.id`)
        .select(selectAllTableCols(TableName.ProjectBot))
        .select(db.ref("publicKey").withSchema(TableName.UserEncryptionKey).as("senderPubKey"))
        .first();
      if (!bot) return bot;
      const { senderPubKey, ...el } = bot;
      return { ...el, sender: { publicKey: senderPubKey } };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find on project bot" });
    }
  };

  const findProjectByBotId = async (botId: string) => {
    try {
      const project = await db(TableName.ProjectBot)
        .where({ [`${TableName.ProjectBot}.id` as "id"]: botId })
        .join(TableName.Project, `${TableName.ProjectBot}.projectId`, `${TableName.Project}.id`)
        .select(selectAllTableCols(TableName.Project))
        .first();

      return project || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project by bot id" });
    }
  };

  const findProjectUserWorkspaceKey = async (projectId: string) => {
    try {
      const doc = await db
        .replicaNode()(TableName.Membership)
        .where(`${TableName.Membership}.scopeProjectId` as "projectId", projectId)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .where(`${TableName.Users}.isGhost` as "isGhost", false)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .join(TableName.ProjectKeys, `${TableName.Membership}.actorUserId`, `${TableName.ProjectKeys}.receiverId`)
        .where(`${TableName.ProjectKeys}.projectId` as "projectId", projectId)
        .join<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .join<TUserEncryptionKeys>(
          db(TableName.UserEncryptionKey).as("senderUserEncryption"),
          `${TableName.ProjectKeys}.senderId`,
          `senderUserEncryption.userId`
        )
        .whereNotNull(`${TableName.UserEncryptionKey}.serverEncryptedPrivateKey`)
        .whereNotNull(`${TableName.UserEncryptionKey}.serverEncryptedPrivateKeyIV`)
        .whereNotNull(`${TableName.UserEncryptionKey}.serverEncryptedPrivateKeyTag`)
        .select(
          db.ref("serverEncryptedPrivateKey").withSchema(TableName.UserEncryptionKey),
          db.ref("serverEncryptedPrivateKeyTag").withSchema(TableName.UserEncryptionKey),
          db.ref("serverEncryptedPrivateKeyIV").withSchema(TableName.UserEncryptionKey),
          db.ref("serverEncryptedPrivateKeyEncoding").withSchema(TableName.UserEncryptionKey),
          db.ref("encryptedKey").withSchema(TableName.ProjectKeys).as("projectEncryptedKey"),
          db.ref("nonce").withSchema(TableName.ProjectKeys).as("projectKeyNonce"),
          db.ref("publicKey").withSchema("senderUserEncryption").as("senderPublicKey"),
          db.ref("id").withSchema(TableName.Users).as("userId")
        )
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all project members" });
    }
  };

  return { ...projectBotOrm, findOne, findProjectByBotId, findProjectUserWorkspaceKey };
};
