import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TResourceEnrollmentTokenDALFactory = ReturnType<typeof resourceEnrollmentTokenDALFactory>;

export const resourceEnrollmentTokenDALFactory = (db: TDbClient) => {
  return ormify(db, TableName.ResourceEnrollmentTokens);
};
