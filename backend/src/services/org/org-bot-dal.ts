import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TOrgBotDALFactory = ReturnType<typeof orgBotDALFactory>;

export const orgBotDALFactory = (db: TDbClient) => {
  const orgBotOrm = ormify(db, TableName.OrgBot);
  return orgBotOrm;
};
