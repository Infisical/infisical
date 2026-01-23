import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TOrgRelayConfigDALFactory = ReturnType<typeof orgRelayConfigDalFactory>;

export const orgRelayConfigDalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.OrgRelayConfig);

  return orm;
};
