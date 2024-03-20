import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TUserGroupMembershipDALFactory = ReturnType<typeof userGroupMembershipDALFactory>;

export const userGroupMembershipDALFactory = (db: TDbClient) => {
  const userGroupMembershipOrm = ormify(db, TableName.UserGroupMembership);

  return {
    ...userGroupMembershipOrm
  };
};
