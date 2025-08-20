import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TConversationDALFactory = ReturnType<typeof conversationDALFactory>;

export const conversationDALFactory = (db: TDbClient) => {
  const conversationOrm = ormify(db, TableName.Conversation);
  return { ...conversationOrm };
};
