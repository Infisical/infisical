import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TAiMcpEndpointDALFactory = ReturnType<typeof aiMcpEndpointDALFactory>;

export const aiMcpEndpointDALFactory = (db: TDbClient) => {
  const aiMcpEndpointOrm = ormify(db, TableName.AiMcpEndpoint);

  return aiMcpEndpointOrm;
};
