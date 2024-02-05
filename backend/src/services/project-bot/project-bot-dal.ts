import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TProjectBots } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TProjectBotDALFactory = ReturnType<typeof projectBotDALFactory>;

export const projectBotDALFactory = (db: TDbClient) => {
  const projectBotOrm = ormify(db, TableName.ProjectBot);

  const findOne = async (filter: Partial<TProjectBots>, tx?: Knex) => {
    try {
      const bot = await (tx || db)(TableName.ProjectBot)
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

  return { ...projectBotOrm, findOne, findProjectByBotId };
};
