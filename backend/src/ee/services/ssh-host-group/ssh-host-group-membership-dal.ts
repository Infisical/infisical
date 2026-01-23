import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TSshHostGroupMembershipDALFactory = ReturnType<typeof sshHostGroupMembershipDALFactory>;

export const sshHostGroupMembershipDALFactory = (db: TDbClient) => {
  const sshHostGroupMembershipOrm = ormify(db, TableName.SshHostGroupMembership);

  return {
    ...sshHostGroupMembershipOrm
  };
};
