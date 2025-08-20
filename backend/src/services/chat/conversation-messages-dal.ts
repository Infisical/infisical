import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TConversationMessagesDALFactory = ReturnType<typeof conversationMessagesDALFactory>;

export const conversationMessagesDALFactory = (db: TDbClient) => {
  const conversationMessagesOrm = ormify(db, TableName.ConversationMessages);
  return { ...conversationMessagesOrm };
};
