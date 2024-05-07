import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TOrgMembershipDALFactory = ReturnType<typeof orgMembershipDALFactory>;

export const orgMembershipDALFactory = (db: TDbClient) => {
  const orgMembershipOrm = ormify(db, TableName.OrgMembership);

  return {
    ...orgMembershipOrm
  };
};
