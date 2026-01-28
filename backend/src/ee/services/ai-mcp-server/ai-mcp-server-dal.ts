import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAiMcpServerDALFactory = ReturnType<typeof aiMcpServerDALFactory>;

export const aiMcpServerDALFactory = (db: TDbClient) => {
  const aiMcpServerOrm = ormify(db, TableName.AiMcpServer);

  return aiMcpServerOrm
};
