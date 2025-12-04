import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAiMcpEndpointServerToolDALFactory = ReturnType<typeof aiMcpEndpointServerToolDALFactory>;

export const aiMcpEndpointServerToolDALFactory = (db: TDbClient) => {
  const aiMcpEndpointServerToolOrm = ormify(db, TableName.AiMcpEndpointServerTool);

  return aiMcpEndpointServerToolOrm;
};
