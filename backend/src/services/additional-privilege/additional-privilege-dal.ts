import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAdditionalPrivilegeDALFactory = ReturnType<typeof additionalPrivilegeDALFactory>;

export const additionalPrivilegeDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AdditionalPrivilege);

  const getMembershipById = async (privilegeId: string) => {
    const doc = await db
      .replicaNode()(TableName.AdditionalPrivilege)
      .join(TableName.Membership, `${TableName.AdditionalPrivilege}.membershipId`, `${TableName.Membership}.id`)
      .select(selectAllTableCols(TableName.Membership))
      .where(`${TableName.AdditionalPrivilege}.id`, privilegeId)
      .first();
    return doc;
  };

  return { ...orm, getMembershipById };
};
