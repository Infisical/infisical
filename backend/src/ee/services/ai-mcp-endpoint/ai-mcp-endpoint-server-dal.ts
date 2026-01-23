import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TAiMcpEndpointServerDALFactory = ReturnType<typeof aiMcpEndpointServerDALFactory>;

export const aiMcpEndpointServerDALFactory = (db: TDbClient) => {
  const aiMcpEndpointServerOrm = ormify(db, TableName.AiMcpEndpointServer);

  const countByEndpointId = async (aiMcpEndpointId: string) => {
    const result = await db.replicaNode()(TableName.AiMcpEndpointServer).where({ aiMcpEndpointId }).count().first();
    return Number(result?.count ?? 0);
  };

  return { ...aiMcpEndpointServerOrm, countByEndpointId };
};
