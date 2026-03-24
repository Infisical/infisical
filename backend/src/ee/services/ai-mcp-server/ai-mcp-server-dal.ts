import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAiMcpServerDALFactory = ReturnType<typeof aiMcpServerDALFactory>;

export const aiMcpServerDALFactory = (db: TDbClient) => {
  const aiMcpServerOrm = ormify(db, TableName.AiMcpServer);

  const findByGatewayId = async (gatewayId: string, tx?: Knex) => {
    const docs = await (tx || db.replicaNode())(TableName.AiMcpServer)
      .leftJoin(TableName.Project, `${TableName.AiMcpServer}.projectId`, `${TableName.Project}.id`)
      .where(`${TableName.AiMcpServer}.gatewayId`, gatewayId)
      .select(
        db.ref("id").withSchema(TableName.AiMcpServer),
        db.ref("name").withSchema(TableName.AiMcpServer),
        db.ref("projectId").withSchema(TableName.AiMcpServer),
        db.ref("name").withSchema(TableName.Project).as("projectName")
      );

    return docs;
  };

  return { ...aiMcpServerOrm, findByGatewayId };
};
