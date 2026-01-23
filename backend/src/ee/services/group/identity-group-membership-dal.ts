import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TIdentityGroupMembershipDALFactory = ReturnType<typeof identityGroupMembershipDALFactory>;

export const identityGroupMembershipDALFactory = (db: TDbClient) => {
  const identityGroupMembershipOrm = ormify(db, TableName.IdentityGroupMembership);

  return {
    ...identityGroupMembershipOrm
  };
};
