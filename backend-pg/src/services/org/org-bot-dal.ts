import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TOrgBotDalFactory = ReturnType<typeof orgBotDalFactory>;

export const orgBotDalFactory = (db: TDbClient) => {
  const orgBotOrm = ormify(db, TableName.OrgBot);
  return orgBotOrm;
};
