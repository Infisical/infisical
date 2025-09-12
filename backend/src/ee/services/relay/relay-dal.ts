import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TRelayDALFactory = ReturnType<typeof relayDalFactory>;

export const relayDalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Relay);

  return orm;
};
