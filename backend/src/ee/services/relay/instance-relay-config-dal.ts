import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TInstanceRelayConfigDALFactory = ReturnType<typeof instanceRelayConfigDalFactory>;

export const instanceRelayConfigDalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.InstanceRelayConfig);

  return orm;
};
