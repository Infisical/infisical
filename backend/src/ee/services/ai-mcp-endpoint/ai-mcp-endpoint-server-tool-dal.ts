import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TAiMcpEndpointServerToolDALFactory = ReturnType<typeof aiMcpEndpointServerToolDALFactory>;

export const aiMcpEndpointServerToolDALFactory = (db: TDbClient) => {
  const aiMcpEndpointServerToolOrm = ormify(db, TableName.AiMcpEndpointServerTool);

  const countByEndpointId = async (aiMcpEndpointId: string) => {
    const result = await db.replicaNode()(TableName.AiMcpEndpointServerTool).where({ aiMcpEndpointId }).count().first();
    return Number(result?.count ?? 0);
  };

  return { ...aiMcpEndpointServerToolOrm, countByEndpointId };
};
