import { TDbClient } from "@app/db";
import { TSecretApprovalRequests, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { TFindFilter, ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { Knex } from "knex";
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
        TableName.SecretApprovalPolicy,
        `${TableName.SecretApprovalRequest}.policyId`,
        `${TableName.SecretApprovalPolicy}.id`
      )
      .join(
        TableName.SarReviewer,
        `${TableName.SecretApprovalRequest}.id`,
        `${TableName.SarReviewer}.requestId`
      )
      .join(
        TableName.SapApprover,
        `${TableName.SecretApprovalPolicy}.id`,
        `${TableName.SapApprover}.policyId`
      )
      .select(selectAllTableCols(TableName.SecretApprovalRequest))
      .select(tx.ref("id").withSchema(TableName.SarReviewer).as("reviewerMemberId"))
      .select(tx.ref("statue").withSchema(TableName.SarReviewer).as("reviewerStatus"))
      .select(tx.ref("id").withSchema(TableName.SecretApprovalPolicy).as("policyId"))
      .select(tx.ref("name").withSchema(TableName.SecretApprovalPolicy).as("policyName"))
      .select(tx.ref("projectId").withSchema(TableName.SecretApprovalPolicy))
      .select(
        tx.ref("secretPath").withSchema(TableName.SecretApprovalPolicy).as("policySecretPath")
      )
      .select(tx.ref("approvals").withSchema(TableName.SecretApprovalPolicy).as("policyApprovals"))
      .select(tx.ref("approverId").withSchema(TableName.SapApprover));

  const findById = async (id: string, tx?: Knex) => {
    try {
      const docs = await findQuery({ id }, tx || db);
      const formatedDoc = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: ({
          id: pk,
          projectId,
          hasMerged,
          status,
          conflicts,
          slug,
          folderId,
          statusChangeBy,
          committerId,
          createdAt,
          updatedAt,
          policyId,
          policyName,
          policyApprovals,
          policySecretPath
        }) => ({
          id: pk,
          hasMerged,
          projectId,
          status,
          conflicts,
          slug,
          folderId,
          statusChangeBy,
          committerId,
          createdAt,
          updatedAt,
          policyId,
          policy: {
            id: policyId,
            name: policyName,
            approvals: policyApprovals,
            secretPath: policySecretPath
          }
        }),
        childrenMapper: [
          {
            key: "reviewerMemberId",
            label: "reviewers",
            mapper: ({ reviewerMemberId: member, reviewerStatus: status }) => ({ member, status })
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
        .where({ projectId })
        .join(
          TableName.SapApprover,
          `${TableName.SecretApprovalRequest}.policyId`,
          `${TableName.SapApprover}.policyId`
        )
        .where(`${TableName.SapApprover}.approverId`, membershipId)
        .orWhere(`${TableName.SecretApprovalRequest}.committerId`, membershipId)
        .groupBy("status")
        .count("status");
      console.log(JSON.stringify(doc, null, 4));
      return { open: 0, closed: 0 };
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
        .where({ projectId, slug: environment, status, committerId: committer })
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
        .where(`${TableName.SapApprover}.approverId`, membershipId)
        .orWhere(`${TableName.SecretApprovalRequest}.committerId`, membershipId)
        .select(selectAllTableCols(TableName.SecretApprovalRequest))
        .select(db.ref("id").withSchema(TableName.SarReviewer).as("reviewerMemberId"))
        .select(db.ref("statue").withSchema(TableName.SarReviewer).as("reviewerStatus"))
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
        parentMapper: ({
          id: pk,
          hasMerged,
          status: pStatus,
          conflicts,
          slug,
          folderId,
          statusChangeBy,
          committerId,
          createdAt,
          updatedAt,
          policyId,
          policyName,
          policyApprovals,
          policySecretPath
        }) => ({
          id: pk,
          hasMerged,
          projectId,
          status: pStatus,
          conflicts,
          slug,
          folderId,
          statusChangeBy,
          committerId,
          createdAt,
          updatedAt,
          policyId,
          policy: {
            id: policyId,
            name: policyName,
            approvals: policyApprovals,
            secretPath: policySecretPath
          }
        }),
        childrenMapper: [
          {
            key: "reviewerMemberId",
            label: "reviewers",
            mapper: ({ reviewerMemberId: member, reviewerStatus: s }) => ({ member, status: s })
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
