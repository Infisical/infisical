import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TProjectGatewayDALFactory = ReturnType<typeof projectGatewayDALFactory>;

export const projectGatewayDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ProjectGateway);
  return orm;
};
