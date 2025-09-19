import { TDbClient } from "@app/db";
import { ormify } from "@app/lib/knex";
import { TableName } from "@app/db/schemas";

export type TIdentityGroupDALFactory = ReturnType<typeof identityGroupDALFactory>;

export const identityGroupDALFactory = (db: TDbClient) => {
  const identityGroupOrm = ormify(db, TableName.IdentityGroups);
  return { ...identityGroupOrm };
};
