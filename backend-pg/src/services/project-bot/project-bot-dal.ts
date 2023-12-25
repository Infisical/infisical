import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName,TProjectBots } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TProjectBotDalFactory = ReturnType<typeof projectBotDalFactory>;

export const projectBotDalFactory = (db: TDbClient) => {
  const projectBotOrm = ormify(db, TableName.ProjectBot);

  const findOne = async (filter: Partial<TProjectBots>, tx?: Knex) => {
    try {
      const bot = await (tx || db)(TableName.ProjectBot)
        .where(filter)
        .join(TableName.Users, `${TableName.ProjectBot}.senderId`, `${TableName.Users}.id`)
        .join(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
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

  return { ...projectBotOrm, findOne };
};
