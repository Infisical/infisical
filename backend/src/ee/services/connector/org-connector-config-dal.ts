import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TOrgConnectorConfigDALFactory = ReturnType<typeof orgConnectorConfigDalFactory>;

export const orgConnectorConfigDalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.OrgConnectorConfig);

  return orm;
};
