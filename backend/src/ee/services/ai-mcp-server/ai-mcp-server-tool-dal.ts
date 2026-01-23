import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TAiMcpServerToolDALFactory = ReturnType<typeof aiMcpServerToolDALFactory>;

export const aiMcpServerToolDALFactory = (db: TDbClient) => {
  const aiMcpServerToolOrm = ormify(db, TableName.AiMcpServerTool);

  return aiMcpServerToolOrm;
};
