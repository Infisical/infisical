import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAiMcpActivityLogDALFactory = ReturnType<typeof aiMcpActivityLogDALFactory>;

export const aiMcpActivityLogDALFactory = (db: TDbClient) => {
  const aiMcpActivityLogOrm = ormify(db, TableName.AiMcpActivityLog);

  return aiMcpActivityLogOrm;
};
