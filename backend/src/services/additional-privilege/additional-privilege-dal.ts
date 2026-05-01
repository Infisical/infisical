import { TDbClient } from "@app/db";
import { TableName, TAdditionalPrivileges } from "@app/db/schemas";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter } from "@app/lib/knex";

export type TAdditionalPrivilegeDALFactory = ReturnType<typeof additionalPrivilegeDALFactory>;

export const additionalPrivilegeDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AdditionalPrivilege);

  const findWithAccessApprovalStatus = async (filter: TFindFilter<TAdditionalPrivileges>) => {
    const docs = await db
      .replicaNode()(TableName.AdditionalPrivilege)
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      .where(buildFindFilter(filter, TableName.AdditionalPrivilege))
      .leftJoin(
        TableName.AccessApprovalRequest,
        `${TableName.AdditionalPrivilege}.id`,
        `${TableName.AccessApprovalRequest}.privilegeId`
      )
      .select(selectAllTableCols(TableName.AdditionalPrivilege))
      .select(
        db.ref("id").withSchema(TableName.AccessApprovalRequest).as("accessApprovalRequestId"),
        db.ref("policyId").withSchema(TableName.AccessApprovalRequest).as("accessApprovalPolicyId")
      );

    const policyIds = [
      ...new Set(docs.map((d) => String(d.accessApprovalPolicyId)).filter((id) => id !== "null" && id !== "undefined"))
    ];

    let approversByPolicyId: Record<string, string[]> = {};
    if (policyIds.length > 0) {
      const approverRows = await db
        .replicaNode()(TableName.AccessApprovalPolicyApprover)
        .whereIn(`${TableName.AccessApprovalPolicyApprover}.policyId`, policyIds)
        .leftJoin(
          TableName.UserGroupMembership,
          `${TableName.AccessApprovalPolicyApprover}.approverGroupId`,
          `${TableName.UserGroupMembership}.groupId`
        )
        .select(
          db.ref("policyId").withSchema(TableName.AccessApprovalPolicyApprover),
          db.ref("approverUserId").withSchema(TableName.AccessApprovalPolicyApprover),
          db.ref("userId").withSchema(TableName.UserGroupMembership).as("groupMemberUserId")
        );

      approversByPolicyId = approverRows.reduce<Record<string, string[]>>((acc, row) => {
        const uid = String(row.approverUserId || row.groupMemberUserId || "");
        if (uid) {
          const pid = String(row.policyId);
          if (!acc[pid]) acc[pid] = [];
          if (!acc[pid].includes(uid)) acc[pid].push(uid);
        }
        return acc;
      }, {});
    }

    return docs.map((doc) => {
      const pid = doc.accessApprovalPolicyId ? String(doc.accessApprovalPolicyId) : null;
      return {
        ...doc,
        isLinkedToAccessApproval: Boolean(doc.accessApprovalRequestId),
        accessApprovalRequestId: (doc.accessApprovalRequestId ?? null) as string | null,
        policyApproverUserIds: pid ? (approversByPolicyId[pid] ?? []) : []
      };
    });
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
