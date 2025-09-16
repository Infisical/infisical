import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityGroupDALFactory = ReturnType<typeof identityGroupDALFactory>;

export const identityGroupDALFactory = (db: TDbClient) => {
  const identityGroupOrm = ormify(db, TableName.IdentityGroups);
  return { ...identityGroupOrm };
};
