import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAdditionalPrivileges } from "@app/db/schemas";
import { chunkArray } from "@app/lib/fn";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter } from "@app/lib/knex";
import { ActorType } from "@app/services/auth/auth-type";

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

  const findFolderScopedPrivileges = async (
    {
      projectId,
      actorId,
      actorType
    }: { projectId: string; actorId: string; actorType: ActorType.USER | ActorType.IDENTITY },
    tx?: Knex
  ) => {
    const docs = await (tx || db)(TableName.AdditionalPrivilege)
      .where({ projectId })
      .whereNotNull("folderId")
      .where(actorType === ActorType.IDENTITY ? { actorIdentityId: actorId } : { actorUserId: actorId })
      .select("id", "name", "folderId", "role", "isTemporary", "temporaryAccessEndTime");

    return docs as {
      id: string;
      name: string;
      folderId: string;
      role: string | null;
      isTemporary: boolean;
      temporaryAccessEndTime: Date | null;
    }[];
  };

  const remapFolderIds = async (pairs: { oldFolderId: string; newFolderId: string }[], tx: Knex) => {
    for (const chunk of chunkArray(pairs, 500)) {
      const values = chunk.map(() => "(?::uuid, ?::uuid)").join(", ");
      const bindings = chunk.flatMap(({ oldFolderId, newFolderId }) => [oldFolderId, newFolderId]);
      // eslint-disable-next-line no-await-in-loop
      await tx.raw(
        `UPDATE ${TableName.AdditionalPrivilege} AS ap
         SET "folderId" = m.new_id
         FROM (VALUES ${values}) AS m(old_id, new_id)
         WHERE ap."folderId" = m.old_id`,
        bindings
      );
    }
  };

  return {
    ...orm,
    findWithAccessApprovalStatus,
    isLinkedToAccessApproval,
    findFolderScopedPrivileges,
    remapFolderIds
  };
};
