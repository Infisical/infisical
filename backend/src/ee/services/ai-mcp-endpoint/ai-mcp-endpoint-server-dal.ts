import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAiMcpEndpointServerDALFactory = ReturnType<typeof aiMcpEndpointServerDALFactory>;

export const aiMcpEndpointServerDALFactory = (db: TDbClient) => {
  const aiMcpEndpointServerOrm = ormify(db, TableName.AiMcpEndpointServer);

  return aiMcpEndpointServerOrm;
};
