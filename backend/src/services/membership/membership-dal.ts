import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TMembershipDALFactory = ReturnType<typeof membershipDALFactory>;

export const membershipDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Membership);
  return orm;
};
