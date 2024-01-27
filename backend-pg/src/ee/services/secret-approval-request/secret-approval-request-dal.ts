import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { SecretApprovalRequestsSchema, TableName, TSecretApprovalRequests } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import {
  ormify,
  selectAllTableCols,
  sqlNestRelationships,
  stripUndefinedInWhere,
  TFindFilter
} from "@app/lib/knex";

import { RequestState } from "./secret-approval-request-types";

export type TSecretApprovalRequestDALFactory = ReturnType<typeof secretApprovalRequestDALFactory>;

type TFindQueryFilter = {
  projectId: string;
  membershipId: string;
  status?: RequestState;
  environment?: string;
  committer?: string;
  limit?: number;
  offset?: number;
};

export const secretApprovalRequestDALFactory = (db: TDbClient) => {
  const secretApprovalRequestOrm = ormify(db, TableName.SecretApprovalRequest);

  const findQuery = (filter: TFindFilter<TSecretApprovalRequests>, tx: Knex) =>
    tx(TableName.SecretApprovalRequest)
      .where(filter)
      .join(
        TableName.SecretFolder,
        `${TableName.SecretApprovalRequest}.folderId`,
        `${TableName.SecretFolder}.id`
      )
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .join(
        TableName.SecretApprovalPolicy,
        `${TableName.SecretApprovalRequest}.policyId`,
        `${TableName.SecretApprovalPolicy}.id`
      )
      .join(
        TableName.SecretApprovalPolicyApprover,
        `${TableName.SecretApprovalPolicy}.id`,
        `${TableName.SecretApprovalPolicyApprover}.policyId`
      )
      .leftJoin(
        TableName.SecretApprovalRequestReviewer,
        `${TableName.SecretApprovalRequest}.id`,
        `${TableName.SecretApprovalRequestReviewer}.requestId`
      )
      .select(selectAllTableCols(TableName.SecretApprovalRequest))
      .select(
        tx.ref("member").withSchema(TableName.SecretApprovalRequestReviewer).as("reviewerMemberId"),
        tx.ref("status").withSchema(TableName.SecretApprovalRequestReviewer).as("reviewerStatus"),
        tx.ref("id").withSchema(TableName.SecretApprovalPolicy).as("policyId"),
        tx.ref("name").withSchema(TableName.SecretApprovalPolicy).as("policyName"),
        tx.ref("projectId").withSchema(TableName.Environment),
        tx.ref("slug").withSchema(TableName.Environment).as("environment"),
        tx.ref("secretPath").withSchema(TableName.SecretApprovalPolicy).as("policySecretPath"),
        tx.ref("approvals").withSchema(TableName.SecretApprovalPolicy).as("policyApprovals"),
        tx.ref("approverId").withSchema(TableName.SecretApprovalPolicyApprover)
      );

  const findById = async (id: string, tx?: Knex) => {
    try {
      const sql = findQuery({ [`${TableName.SecretApprovalRequest}.id` as "id"]: id }, tx || db);
      const docs = await sql;
      const formatedDoc = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          ...SecretApprovalRequestsSchema.parse(el),
          projectId: el.projectId,
          environment: el.environment,
          policy: {
            id: el.policyId,
            name: el.policyName,
            approvals: el.policyApprovals,
            secretPath: el.policySecretPath
          }
        }),
        childrenMapper: [
          {
            key: "reviewerMemberId",
            label: "reviewers" as const,
            mapper: ({ reviewerMemberId: member, reviewerStatus: status }) =>
              member ? { member, status } : undefined
          },
          { key: "approverId", label: "approvers" as const, mapper: ({ approverId }) => approverId }
        ]
      });
      if (!formatedDoc?.[0]) return;
      return {
        ...formatedDoc[0],
        policy: { ...formatedDoc[0].policy, approvers: formatedDoc[0].approvers }
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByIdSAR" });
    }
  };

  const findProjectRequestCount = async (projectId: string, membershipId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db)
        .with(
          "temp",
          (tx || db)(TableName.SecretApprovalRequest)
            .join(
              TableName.SecretFolder,
              `${TableName.SecretApprovalRequest}.folderId`,
              `${TableName.SecretFolder}.id`
            )
            .join(
              TableName.Environment,
              `${TableName.SecretFolder}.envId`,
              `${TableName.Environment}.id`
            )
            .join(
              TableName.SecretApprovalPolicyApprover,
              `${TableName.SecretApprovalRequest}.policyId`,
              `${TableName.SecretApprovalPolicyApprover}.policyId`
            )
            .where({ projectId })
            .andWhere((bd) =>
              bd
                .where(`${TableName.SecretApprovalPolicyApprover}.approverId`, membershipId)
                .orWhere(`${TableName.SecretApprovalRequest}.committerId`, membershipId)
            )
            .select("status", `${TableName.SecretApprovalRequest}.id`)
            .groupBy(`${TableName.SecretApprovalRequest}.id`, "status")
            .count("status")
        )
        .select("status")
        .from("temp")
        .groupBy("status")
        .count("status");

      return {
        open: parseInt(
          (docs.find(({ status }) => status === RequestState.Open)?.count as string) || "0",
          10
        ),
        closed: parseInt(
          (docs.find(({ status }) => status === RequestState.Closed)?.count as string) || "0",
          10
        )
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRequestCount" });
    }
  };

  const findByProjectId = async (
    {
      status,
      limit = 20,
      offset = 0,
      projectId,
      committer,
      environment,
      membershipId
    }: TFindQueryFilter,
    tx?: Knex
  ) => {
    try {
      // akhilmhdh: If ever u wanted a 1 to so many relationship connected with pagination
      // this is the place u wanna look at.
      const query = (tx || db)(TableName.SecretApprovalRequest)
        .join(
          TableName.SecretFolder,
          `${TableName.SecretApprovalRequest}.folderId`,
          `${TableName.SecretFolder}.id`
        )
        .join(
          TableName.Environment,
          `${TableName.SecretFolder}.envId`,
          `${TableName.Environment}.id`
        )
        .join(
          TableName.SecretApprovalPolicy,
          `${TableName.SecretApprovalRequest}.policyId`,
          `${TableName.SecretApprovalPolicy}.id`
        )
        .join(
          TableName.SecretApprovalPolicyApprover,
          `${TableName.SecretApprovalPolicy}.id`,
          `${TableName.SecretApprovalPolicyApprover}.policyId`
        )
        .leftJoin(
          TableName.SecretApprovalRequestReviewer,
          `${TableName.SecretApprovalRequest}.id`,
          `${TableName.SecretApprovalRequestReviewer}.requestId`
        )
        .leftJoin(
          TableName.SecretApprovalRequestSecret,
          `${TableName.SecretApprovalRequestSecret}.requestId`,
          `${TableName.SecretApprovalRequest}.id`
        )
        .where(
          stripUndefinedInWhere({
            projectId,
            [`${TableName.Environment}.slug` as "slug"]: environment,
            [`${TableName.SecretApprovalRequest}.status`]: status,
            committerId: committer
          })
        )
        .andWhere((bd) =>
          bd
            .where(`${TableName.SecretApprovalPolicyApprover}.approverId`, membershipId)
            .orWhere(`${TableName.SecretApprovalRequest}.committerId`, membershipId)
        )
        .select(selectAllTableCols(TableName.SecretApprovalRequest))
        .select(
          db.ref("projectId").withSchema(TableName.Environment),
          db.ref("slug").withSchema(TableName.Environment).as("environment"),
          db.ref("id").withSchema(TableName.SecretApprovalRequestReviewer).as("reviewerMemberId"),
          db.ref("status").withSchema(TableName.SecretApprovalRequestReviewer).as("reviewerStatus"),
          db.ref("id").withSchema(TableName.SecretApprovalPolicy).as("policyId"),
          db.ref("name").withSchema(TableName.SecretApprovalPolicy).as("policyName"),
          db.ref("op").withSchema(TableName.SecretApprovalRequestSecret).as("commitOp"),
          db.ref("secretId").withSchema(TableName.SecretApprovalRequestSecret).as("commitSecretId"),
          db.ref("id").withSchema(TableName.SecretApprovalRequestSecret).as("commitId"),
          db.raw(
            `DENSE_RANK() OVER (partition by ${TableName.Environment}."projectId" ORDER BY ${TableName.SecretApprovalRequest}."id" DESC) as rank`
          ),
          db.ref("secretPath").withSchema(TableName.SecretApprovalPolicy).as("policySecretPath"),
          db.ref("approvals").withSchema(TableName.SecretApprovalPolicy).as("policyApprovals"),
          db.ref("approverId").withSchema(TableName.SecretApprovalPolicyApprover)
        )
        .orderBy("createdAt", "desc");

      const docs = await (tx || db)
        .with("w", query)
        .select("*")
        .from<Awaited<typeof query>[number]>("w")
        .where("w.rank", ">=", offset)
        .andWhere("w.rank", "<", offset + limit);
      const formatedDoc = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          ...SecretApprovalRequestsSchema.parse(el),
          environment: el.environment,
          projectId: el.projectId,
          policy: {
            id: el.policyId,
            name: el.policyName,
            approvals: el.policyApprovals,
            secretPath: el.policySecretPath
          }
        }),
        childrenMapper: [
          {
            key: "reviewerMemberId",
            label: "reviewers" as const,
            mapper: ({ reviewerMemberId: member, reviewerStatus: s }) =>
              member ? { member, status: s } : undefined
          },
          {
            key: "approverId",
            label: "approvers" as const,
            mapper: ({ approverId }) => approverId
          },
          {
            key: "commitId",
            label: "commits" as const,
            mapper: ({ commitSecretId: secretId, commitId: id, commitOp: op }) => ({
              op,
              id,
              secretId
            })
          }
        ]
      });
      return formatedDoc.map((el) => ({
        ...el,
        policy: { ...el.policy, approvers: el.approvers }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSAR" });
    }
  };

  return { ...secretApprovalRequestOrm, findById, findProjectRequestCount, findByProjectId };
};
