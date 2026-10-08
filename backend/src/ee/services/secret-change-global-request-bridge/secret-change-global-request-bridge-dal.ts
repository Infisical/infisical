import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TApprovalRequests, TSecretChangeRequests } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

import {
  applyRequestOrdering,
  TSecretApprovalRequestListFilter
} from "../secret-approval-request/secret-approval-request-dal";
import { RequestState } from "../secret-approval-request/secret-approval-request-types";

export type TSecretChangeGlobalRequestBridgeDALFactory = ReturnType<typeof secretChangeGlobalRequestBridgeDALFactory>;

export type TSecretChangeRequestListRow = TApprovalRequests &
  Pick<
    TSecretChangeRequests,
    | "folderId"
    | "slug"
    | "hasMerged"
    | "conflicts"
    | "commitMessage"
    | "bypassReason"
    | "isReplicated"
    | "statusChangedByUserId"
  > & {
    secretChangeId: string;
    environment: string;
    environmentName: string;
    requestFolderPath: string;
    policyName: string | null;
    policyEnforcementLevel: string | null;
    policyConstraints: unknown;
    policySecretPath: string | null;
    committerUserEmail: string | null;
    committerUserUsername: string | null;
    committerUserFirstName: string | null;
    committerUserLastName: string | null;
    committerIdentityName: string | null;
  };

export type TSecretChangeRequestListResultRows = { rows: TSecretChangeRequestListRow[]; totalCount: number };

// A user without the project-wide read permission sees the requests they opened and the ones they can approve,
// which on the global approval system is recorded per request step rather than on the policy.
const buildAccessFilter = (qb: Knex.QueryBuilder, dbInstance: Knex, userId?: string) => {
  if (!userId) return;
  void qb.andWhere((bd) => {
    void bd.where(`${TableName.ApprovalRequests}.requesterId`, userId).orWhereExists(
      dbInstance(TableName.ApprovalRequestSteps)
        .select(dbInstance.raw("1"))
        .join(
          TableName.ApprovalRequestStepEligibleApprovers,
          `${TableName.ApprovalRequestSteps}.id`,
          `${TableName.ApprovalRequestStepEligibleApprovers}.stepId`
        )
        .leftJoin(
          TableName.UserGroupMembership,
          `${TableName.ApprovalRequestStepEligibleApprovers}.groupId`,
          `${TableName.UserGroupMembership}.groupId`
        )
        .whereRaw("?? = ??", [`${TableName.ApprovalRequestSteps}.requestId`, `${TableName.ApprovalRequests}.id`])
        .andWhere((inner) => {
          void inner
            .where(`${TableName.ApprovalRequestStepEligibleApprovers}.userId`, userId)
            .orWhere(`${TableName.UserGroupMembership}.userId`, userId);
        })
    );
  });
};

const buildCoreQuery = (dbInstance: Knex, projectId: string) =>
  dbInstance(TableName.ApprovalRequests)
    .where(`${TableName.ApprovalRequests}.type`, ApprovalPolicyType.SecretChange)
    .where(`${TableName.ApprovalRequests}.projectId`, projectId)
    .join(
      TableName.SecretChangeRequests,
      `${TableName.SecretChangeRequests}.approvalRequestId`,
      `${TableName.ApprovalRequests}.id`
    )
    .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.SecretChangeRequests}.folderId`)
    .join(TableName.Environment, function joinActiveEnvForSecretFolder() {
      this.on(`${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`).andOnNull(
        `${TableName.Environment}.deleteAfter`
      );
    })
    .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
    .whereNull(`${TableName.Project}.deleteAfter`);

export const secretChangeGlobalRequestBridgeDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.SecretChangeRequests);

  const findByProjectId = async (
    {
      projectId,
      userId,
      status,
      environment,
      committer,
      limit = 20,
      offset = 0,
      search,
      orderBy,
      orderDirection
    }: TSecretApprovalRequestListFilter,
    tx?: Knex
  ): Promise<TSecretChangeRequestListResultRows> => {
    try {
      const dbInstance = tx || db.replicaNode();
      const innerQuery = buildCoreQuery(dbInstance, projectId)
        .leftJoin(
          TableName.ApprovalPolicies,
          `${TableName.ApprovalPolicies}.id`,
          `${TableName.ApprovalRequests}.policyId`
        )
        .leftJoin(TableName.ApprovalPolicySecretEnvironment, function joinPolicyEnvironment() {
          this.on(`${TableName.ApprovalPolicySecretEnvironment}.policyId`, `${TableName.ApprovalPolicies}.id`).andOn(
            `${TableName.ApprovalPolicySecretEnvironment}.envId`,
            `${TableName.SecretFolder}.envId`
          );
        })
        .leftJoin(
          db(TableName.Users).as("committerUser"),
          `${TableName.ApprovalRequests}.requesterId`,
          "committerUser.id"
        )
        .leftJoin(
          db(TableName.Identity).as("committerIdentity"),
          `${TableName.ApprovalRequests}.machineIdentityId`,
          "committerIdentity.id"
        )
        .where((qb) => {
          if (environment) void qb.where(`${TableName.Environment}.slug`, environment);
          if (status) void qb.where(`${TableName.ApprovalRequests}.status`, status);
          if (committer) void qb.where(`${TableName.ApprovalRequests}.requesterId`, committer);
        })
        .modify((qb) => buildAccessFilter(qb, dbInstance, userId))
        .select(selectAllTableCols(TableName.ApprovalRequests))
        .select(
          db.ref("id").withSchema(TableName.SecretChangeRequests).as("secretChangeId"),
          db.ref("folderId").withSchema(TableName.SecretChangeRequests),
          db.ref("slug").withSchema(TableName.SecretChangeRequests),
          db.ref("hasMerged").withSchema(TableName.SecretChangeRequests),
          db.ref("conflicts").withSchema(TableName.SecretChangeRequests),
          db.ref("commitMessage").withSchema(TableName.SecretChangeRequests),
          db.ref("bypassReason").withSchema(TableName.SecretChangeRequests),
          db.ref("isReplicated").withSchema(TableName.SecretChangeRequests),
          db.ref("statusChangedByUserId").withSchema(TableName.SecretChangeRequests),
          db.ref("slug").withSchema(TableName.Environment).as("environment"),
          db.ref("name").withSchema(TableName.Environment).as("environmentName"),
          db.ref("name").withSchema(TableName.SecretFolder).as("requestFolderPath"),
          db.ref("name").withSchema(TableName.ApprovalPolicies).as("policyName"),
          db.ref("enforcementLevel").withSchema(TableName.ApprovalPolicies).as("policyEnforcementLevel"),
          db.ref("constraints").withSchema(TableName.ApprovalPolicies).as("policyConstraints"),
          db.ref("secretPath").withSchema(TableName.ApprovalPolicySecretEnvironment).as("policySecretPath"),
          db.ref("email").withSchema("committerUser").as("committerUserEmail"),
          db.ref("username").withSchema("committerUser").as("committerUserUsername"),
          db.ref("firstName").withSchema("committerUser").as("committerUserFirstName"),
          db.ref("lastName").withSchema("committerUser").as("committerUserLastName"),
          db.ref("name").withSchema("committerIdentity").as("committerIdentityName")
        )
        .as("inner");

      const baseQuery = dbInstance.select("*").from(innerQuery);

      if (search) {
        const pattern = `%${sanitizeSqlLikeString(search)}%`;
        void baseQuery.where((qb) => {
          void qb
            .whereRaw(`CONCAT_WS(' ', ??, ??) ilike ?`, [
              db.ref("committerUserFirstName"),
              db.ref("committerUserLastName"),
              pattern
            ])
            .orWhereRaw(`?? ilike ?`, [db.ref("committerUserUsername"), pattern])
            .orWhereRaw(`?? ilike ?`, [db.ref("committerUserEmail"), pattern])
            .orWhereRaw(`?? ilike ?`, [db.ref("committerIdentityName"), pattern])
            .orWhereILike("environmentName", pattern)
            .orWhereILike("environment", pattern)
            .orWhereILike("policySecretPath", pattern)
            .orWhereILike("requestFolderPath", pattern)
            .orWhereExists(
              dbInstance(TableName.SecretApprovalRequestSecretV2)
                .select(dbInstance.raw("1"))
                .whereRaw("?? = ??", [
                  `${TableName.SecretApprovalRequestSecretV2}.secretChangeId`,
                  "inner.secretChangeId"
                ])
                .whereILike(`${TableName.SecretApprovalRequestSecretV2}.key`, pattern)
            );
        });
      }

      const pageQuery = applyRequestOrdering(baseQuery.clone(), orderBy, orderDirection)
        .select(db.raw("COUNT(*) OVER () as total"))
        .offset(offset)
        .limit(limit);
      const rows = (await pageQuery) as (TSecretChangeRequestListRow & { total: string })[];
      let totalCount = Number(rows[0]?.total ?? 0);

      if (!rows.length) {
        const countResult = (await dbInstance
          .count({ count: "*" })
          .from(baseQuery.clone().as("count_query"))
          .first()) as { count: string } | undefined;
        totalCount = Number(countResult?.count ?? 0);
      }

      return { rows: rows.map(({ total, ...row }) => row), totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSecretChangeRequestsByProjectId" });
    }
  };

  const countByProjectId = async (projectId: string, userId?: string, policyId?: string, tx?: Knex) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const rows = (await buildCoreQuery(dbInstance, projectId)
        .where((qb) => {
          if (policyId) void qb.where(`${TableName.ApprovalRequests}.policyId`, policyId);
        })
        .modify((qb) => buildAccessFilter(qb, dbInstance, userId))
        .select(`${TableName.ApprovalRequests}.status`)
        .count(`${TableName.ApprovalRequests}.id as count`)
        .groupBy(`${TableName.ApprovalRequests}.status`)) as { status: string; count: string }[];

      const countOf = (state: RequestState) => parseInt(rows.find((row) => row.status === state)?.count || "0", 10);
      return { open: countOf(RequestState.Open), closed: countOf(RequestState.Closed) };
    } catch (error) {
      throw new DatabaseError({ error, name: "CountSecretChangeRequestsByProjectId" });
    }
  };

  return { ...orm, findByProjectId, countByProjectId };
};
