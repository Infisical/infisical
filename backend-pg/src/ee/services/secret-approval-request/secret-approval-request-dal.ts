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

export type TSecretApprovalRequestDalFactory = ReturnType<typeof secretApprovalRequestDalFactory>;

type TFindQueryFilter = {
  projectId: string;
  membershipId: string;
  status?: RequestState;
  environment?: string;
  committer?: string;
  limit?: number;
  offset?: number;
};

export const secretApprovalRequestDalFactory = (db: TDbClient) => {
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
        TableName.SapApprover,
        `${TableName.SecretApprovalPolicy}.id`,
        `${TableName.SapApprover}.policyId`
      )
      .leftJoin(
        TableName.SarReviewer,
        `${TableName.SecretApprovalRequest}.id`,
        `${TableName.SarReviewer}.requestId`
      )
      .select(selectAllTableCols(TableName.SecretApprovalRequest))
      .select(tx.ref("member").withSchema(TableName.SarReviewer).as("reviewerMemberId"))
      .select(tx.ref("status").withSchema(TableName.SarReviewer).as("reviewerStatus"))
      .select(tx.ref("id").withSchema(TableName.SecretApprovalPolicy).as("policyId"))
      .select(tx.ref("name").withSchema(TableName.SecretApprovalPolicy).as("policyName"))
      .select(tx.ref("projectId").withSchema(TableName.Environment))
      .select(
        tx.ref("secretPath").withSchema(TableName.SecretApprovalPolicy).as("policySecretPath")
      )
      .select(tx.ref("approvals").withSchema(TableName.SecretApprovalPolicy).as("policyApprovals"))
      .select(tx.ref("approverId").withSchema(TableName.SapApprover));

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
            label: "reviewers",
            mapper: ({ reviewerMemberId: member, reviewerStatus: status }) =>
              member ? { member, status } : undefined
          },
          { key: "approverId", label: "approvers", mapper: ({ approverId }) => approverId }
        ] as const
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
      const doc = await (tx || db)(TableName.SecretApprovalRequest)
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
          TableName.SapApprover,
          `${TableName.SecretApprovalRequest}.policyId`,
          `${TableName.SapApprover}.policyId`
        )
        .where({ projectId })
        .where(`${TableName.SapApprover}.approverId`, membershipId)
        .orWhere(`${TableName.SecretApprovalRequest}.committerId`, membershipId)
        .groupBy("status")
        .count("status")
        .select("status");
      return {
        open: parseInt(
          (doc.find(({ status }) => status === RequestState.Open)?.count as string) || "0",
          10
        ),
        closed: parseInt(
          (doc.find(({ status }) => status === RequestState.Closed)?.count as string) || "0",
          10
        )
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRequestCount" });
    }
  };

  const findByProjectId = async (
    { status, limit, offset, projectId, committer, environment, membershipId }: TFindQueryFilter,
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db)(TableName.SecretApprovalRequest)
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
          TableName.SapApprover,
          `${TableName.SecretApprovalPolicy}.id`,
          `${TableName.SapApprover}.policyId`
        )
        .leftJoin(
          TableName.SarReviewer,
          `${TableName.SecretApprovalRequest}.id`,
          `${TableName.SarReviewer}.requestId`
        )
        .where(
          stripUndefinedInWhere({
            projectId,
            slug: environment,
            [`${TableName.SecretApprovalRequest}.status`]: status,
            committerId: committer
          })
        )
        .andWhere((bd) =>
          bd
            .where(`${TableName.SapApprover}.approverId`, membershipId)
            .orWhere(`${TableName.SecretApprovalRequest}.committerId`, membershipId)
        )
        .select(selectAllTableCols(TableName.SecretApprovalRequest))
        .select(db.ref("projectId").withSchema(TableName.Environment))
        .select(db.ref("id").withSchema(TableName.SarReviewer).as("reviewerMemberId"))
        .select(db.ref("status").withSchema(TableName.SarReviewer).as("reviewerStatus"))
        .select(db.ref("id").withSchema(TableName.SecretApprovalPolicy).as("policyId"))
        .select(db.ref("name").withSchema(TableName.SecretApprovalPolicy).as("policyName"))
        .select(
          db.ref("secretPath").withSchema(TableName.SecretApprovalPolicy).as("policySecretPath")
        )
        .select(
          db.ref("approvals").withSchema(TableName.SecretApprovalPolicy).as("policyApprovals")
        )
        .select(db.ref("approverId").withSchema(TableName.SapApprover));
      const formatedDoc = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          ...SecretApprovalRequestsSchema.parse(el),
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
            label: "reviewers",
            mapper: ({ reviewerMemberId: member, reviewerStatus: s }) =>
              member ? { member, status: s } : undefined
          },
          { key: "approverId", label: "approvers", mapper: ({ approverId }) => approverId }
        ] as const
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
