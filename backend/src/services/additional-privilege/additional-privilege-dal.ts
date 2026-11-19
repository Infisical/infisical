import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAdditionalPrivileges } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";
import { buildFindFilter, ormify, selectAllTableCols, TFindFilter } from "@app/lib/knex";
import { ApprovalPolicyType, ApprovalRequestGrantStatus } from "@app/services/approval-policy/approval-policy-enums";
import { ActorType } from "@app/services/auth/auth-type";

export type TAdditionalPrivilegeDALFactory = ReturnType<typeof additionalPrivilegeDALFactory>;

const groupApproverUserIdsByPolicyId = (
  rows: { policyId: string; approverUserId?: string | null; groupMemberUserId?: string | null }[]
) =>
  rows.reduce<Record<string, string[]>>((acc, row) => {
    const uid = String(row.approverUserId || row.groupMemberUserId || "");
    if (uid) {
      const pid = String(row.policyId);
      if (!acc[pid]) acc[pid] = [];
      if (!acc[pid].includes(uid)) acc[pid].push(uid);
    }
    return acc;
  }, {});

export const additionalPrivilegeDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AdditionalPrivilege);

  const findWithAccessApprovalStatus = async (filter: TFindFilter<TAdditionalPrivileges>) => {
    const docs = await db
      .replicaNode()(TableName.AdditionalPrivilege)
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      .where(buildFindFilter(filter, TableName.AdditionalPrivilege))
      .leftJoin(
        TableName.ApprovalRequestGrants,
        `${TableName.AdditionalPrivilege}.grantId`,
        `${TableName.ApprovalRequestGrants}.id`
      )
      .leftJoin(TableName.ApprovalRequests, (join) => {
        join
          .on(`${TableName.ApprovalRequestGrants}.requestId`, `${TableName.ApprovalRequests}.id`)
          .andOnVal(`${TableName.ApprovalRequests}.type`, ApprovalPolicyType.SecretAccess);
      })
      .select(selectAllTableCols(TableName.AdditionalPrivilege))
      .select(
        db.ref("id").withSchema(TableName.ApprovalRequests).as("approvalRequestId"),
        db.ref("policyId").withSchema(TableName.ApprovalRequests).as("approvalPolicyId")
      );

    const policyIds = [
      ...new Set(docs.filter((doc) => doc.approvalPolicyId).map((doc) => String(doc.approvalPolicyId)))
    ];

    let approversByPolicyId: Record<string, string[]> = {};
    if (policyIds.length > 0) {
      const approverRows = await db
        .replicaNode()(TableName.ApprovalPolicySteps)
        .whereIn(`${TableName.ApprovalPolicySteps}.policyId`, policyIds)
        .join(
          TableName.ApprovalPolicyStepApprovers,
          `${TableName.ApprovalPolicySteps}.id`,
          `${TableName.ApprovalPolicyStepApprovers}.policyStepId`
        )
        .leftJoin(
          TableName.UserGroupMembership,
          `${TableName.ApprovalPolicyStepApprovers}.groupId`,
          `${TableName.UserGroupMembership}.groupId`
        )
        .select(
          db.ref("policyId").withSchema(TableName.ApprovalPolicySteps),
          db.ref("userId").withSchema(TableName.ApprovalPolicyStepApprovers).as("approverUserId"),
          db.ref("userId").withSchema(TableName.UserGroupMembership).as("groupMemberUserId")
        );

      approversByPolicyId = groupApproverUserIdsByPolicyId(approverRows);
    }

    return docs.map(({ approvalRequestId, approvalPolicyId, ...doc }) => ({
      ...doc,
      isLinkedToAccessApproval: Boolean(approvalRequestId),
      accessApprovalRequestId: (approvalRequestId ?? null) as string | null,
      policyApproverUserIds: approvalPolicyId ? (approversByPolicyId[String(approvalPolicyId)] ?? []) : []
    }));
  };

  const isLinkedToAccessApproval = async (privilegeId: string): Promise<boolean> => {
    const result = await db
      .replicaNode()(TableName.AdditionalPrivilege)
      .join(
        TableName.ApprovalRequestGrants,
        `${TableName.AdditionalPrivilege}.grantId`,
        `${TableName.ApprovalRequestGrants}.id`
      )
      .join(
        TableName.ApprovalRequests,
        `${TableName.ApprovalRequestGrants}.requestId`,
        `${TableName.ApprovalRequests}.id`
      )
      .where(`${TableName.AdditionalPrivilege}.id`, privilegeId)
      .where(`${TableName.ApprovalRequests}.type`, ApprovalPolicyType.SecretAccess)
      .first(db.ref("id").withSchema(TableName.ApprovalRequests));

    return Boolean(result);
  };

  // Without an actor, returns the folder grants of every user and identity in the project.
  const findFolderScopedPrivileges = async (
    {
      projectId,
      actorId,
      actorType
    }: { projectId: string; actorId?: string; actorType?: ActorType.USER | ActorType.IDENTITY },
    tx?: Knex
  ) => {
    const docs = await (tx || db)(TableName.AdditionalPrivilege)
      .where({ projectId })
      .whereNotNull("folderId")
      .where((qb) => {
        if (actorId) {
          void qb.where(actorType === ActorType.IDENTITY ? { actorIdentityId: actorId } : { actorUserId: actorId });
        }
      })
      .select(
        "id",
        "name",
        "folderId",
        "role",
        "isTemporary",
        "temporaryAccessEndTime",
        "actorUserId",
        "actorIdentityId"
      );

    return docs as {
      id: string;
      name: string;
      folderId: string;
      role: string | null;
      isTemporary: boolean;
      temporaryAccessEndTime: Date | null;
      actorUserId: string | null;
      actorIdentityId: string | null;
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

  const $revokeGrantsOfDeletedPrivileges = async (privileges: TAdditionalPrivileges[], tx: Knex) => {
    const grantIds = privileges.map(({ grantId }) => grantId).filter((grantId): grantId is string => Boolean(grantId));
    if (!grantIds.length) return;

    try {
      for (const chunk of chunkArray(grantIds, 500)) {
        // eslint-disable-next-line no-await-in-loop
        await tx(TableName.ApprovalRequestGrants)
          .whereIn("id", chunk)
          .where("status", ApprovalRequestGrantStatus.Active)
          .update({ status: ApprovalRequestGrantStatus.Revoked, revokedAt: new Date() });
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Revoke grants of deleted additional privileges" });
    }
  };

  // The grantId FK only nulls itself on delete, so the grant would otherwise stay active with no privilege behind it.
  const deleteById: typeof orm.deleteById = async (id, tx) => {
    const run = async (trx: Knex) => {
      const doc = await orm.deleteById(id, trx);
      if (doc) await $revokeGrantsOfDeletedPrivileges([doc], trx);
      return doc;
    };
    return tx ? run(tx) : orm.transaction(run);
  };

  const deleteFn: typeof orm.delete = async (filter, tx) => {
    const run = async (trx: Knex) => {
      const docs = await orm.delete(filter, trx);
      await $revokeGrantsOfDeletedPrivileges(docs, trx);
      return docs;
    };
    return tx ? run(tx) : orm.transaction(run);
  };

  return {
    ...orm,
    deleteById,
    delete: deleteFn,
    findWithAccessApprovalStatus,
    isLinkedToAccessApproval,
    findFolderScopedPrivileges,
    remapFolderIds
  };
};
