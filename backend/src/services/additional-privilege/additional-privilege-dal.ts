import { TDbClient } from "@app/db";
import { TableName, TAdditionalPrivileges } from "@app/db/schemas";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter } from "@app/lib/knex";

export type TAdditionalPrivilegeDALFactory = ReturnType<typeof additionalPrivilegeDALFactory>;

export const additionalPrivilegeDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AdditionalPrivilege);

  const findWithAccessApprovalStatus = async (filter: TFindFilter<TAdditionalPrivileges>) => {
    const docs = await db
      .replicaNode()(TableName.AdditionalPrivilege)
      .where(buildFindFilter(filter, TableName.AdditionalPrivilege))
      .leftJoin(
        TableName.AccessApprovalRequest,
        `${TableName.AdditionalPrivilege}.id`,
        `${TableName.AccessApprovalRequest}.privilegeId`
      )
      .select(selectAllTableCols(TableName.AdditionalPrivilege))
      .select(db.ref("id").withSchema(TableName.AccessApprovalRequest).as("accessApprovalRequestId"));

    return docs.map((doc) => ({
      ...doc,
      isLinkedToAccessApproval: Boolean(doc.accessApprovalRequestId)
    }));
  };

  const isLinkedToAccessApproval = async (privilegeId: string): Promise<boolean> => {
    const result = await db.replicaNode()(TableName.AccessApprovalRequest).where({ privilegeId }).first();

    return Boolean(result);
  };

  return {
    ...orm,
    findWithAccessApprovalStatus,
    isLinkedToAccessApproval
  };
};
