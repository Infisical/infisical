import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { SecretApprovalPoliciesSchema, TableName, TSecretApprovalPolicies, TUsers } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, sqlNestRelationships, TFindFilter } from "@app/lib/knex";

import { ApproverType } from "../access-approval-policy/access-approval-policy-types";

export type TSecretApprovalPolicyDALFactory = ReturnType<typeof secretApprovalPolicyDALFactory>;

export const secretApprovalPolicyDALFactory = (db: TDbClient) => {
  const secretApprovalPolicyOrm = ormify(db, TableName.SecretApprovalPolicy);

  const secretApprovalPolicyFindQuery = (tx: Knex, filter: TFindFilter<TSecretApprovalPolicies>) =>
    tx(TableName.SecretApprovalPolicy)
      // eslint-disable-next-line
      .where(buildFindFilter(filter))
      .join(TableName.Environment, `${TableName.SecretApprovalPolicy}.envId`, `${TableName.Environment}.id`)
      .leftJoin(
        TableName.SecretApprovalPolicyApprover,
        `${TableName.SecretApprovalPolicy}.id`,
        `${TableName.SecretApprovalPolicyApprover}.policyId`
      )
      .leftJoin(
        TableName.UserGroupMembership,
        `${TableName.SecretApprovalPolicyApprover}.approverGroupId`,
        `${TableName.UserGroupMembership}.groupId`
      )
      .leftJoin<TUsers>(
        db(TableName.Users).as("secretApprovalPolicyApproverUser"),
        `${TableName.SecretApprovalPolicyApprover}.approverUserId`,
        "secretApprovalPolicyApproverUser.id"
      )
      .leftJoin<TUsers>(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
      .select(
        tx.ref("id").withSchema("secretApprovalPolicyApproverUser").as("approverUserId"),
        tx.ref("email").withSchema("secretApprovalPolicyApproverUser").as("approverEmail"),
        tx.ref("firstName").withSchema("secretApprovalPolicyApproverUser").as("approverFirstName"),
        tx.ref("lastName").withSchema("secretApprovalPolicyApproverUser").as("approverLastName")
      )
      .select(
        tx.ref("approverGroupId").withSchema(TableName.SecretApprovalPolicyApprover),
        tx.ref("userId").withSchema(TableName.UserGroupMembership).as("approverGroupUserId"),
        tx.ref("email").withSchema(TableName.Users).as("approverGroupEmail"),
        tx.ref("firstName").withSchema(TableName.Users).as("approverGroupFirstName"),
        tx.ref("lastName").withSchema(TableName.Users).as("approverGroupLastName")
      )
      .select(
        tx.ref("name").withSchema(TableName.Environment).as("envName"),
        tx.ref("slug").withSchema(TableName.Environment).as("envSlug"),
        tx.ref("id").withSchema(TableName.Environment).as("envId"),
        tx.ref("projectId").withSchema(TableName.Environment)
      )
      .select(selectAllTableCols(TableName.SecretApprovalPolicy))
      .orderBy("createdAt", "asc");

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await secretApprovalPolicyFindQuery(tx || db.replicaNode(), {
        [`${TableName.SecretApprovalPolicy}.id` as "id"]: id
      });
      const formatedDoc = sqlNestRelationships({
        data: doc,
        key: "id",
        parentMapper: (data) => ({
          environment: { id: data.envId, name: data.envName, slug: data.envSlug },
          projectId: data.projectId,
          ...SecretApprovalPoliciesSchema.parse(data)
        }),
        childrenMapper: [
          {
            key: "approverUserId",
            label: "userApprovers" as const,
            mapper: ({
              approverUserId: userId,
              approverEmail: email,
              approverFirstName: firstName,
              approverLastName: lastName
            }) => ({
              userId,
              email,
              firstName,
              lastName
            })
          },
          {
            key: "approverGroupUserId",
            label: "userApprovers" as const,
            mapper: ({
              approverGroupUserId: userId,
              approverGroupEmail: email,
              approverGroupFirstName: firstName,
              approverGroupLastName: lastName
            }) => ({
              userId,
              email,
              firstName,
              lastName
            })
          }
        ]
      });

      return formatedDoc?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindById" });
    }
  };

  const find = async (filter: TFindFilter<TSecretApprovalPolicies & { projectId: string }>, tx?: Knex) => {
    try {
      const docs = await secretApprovalPolicyFindQuery(tx || db.replicaNode(), filter);
      const formatedDoc = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (data) => ({
          environment: { id: data.envId, name: data.envName, slug: data.envSlug },
          projectId: data.projectId,
          ...SecretApprovalPoliciesSchema.parse(data)
        }),
        childrenMapper: [
          {
            key: "approverUserId",
            label: "approvers" as const,
            mapper: ({ approverUserId: id }) => ({
              type: ApproverType.User,
              id
            })
          },
          {
            key: "approverGroupId",
            label: "approvers" as const,
            mapper: ({ approverGroupId: id }) => ({
              type: ApproverType.Group,
              id
            })
          },
          {
            key: "approverUserId",
            label: "userApprovers" as const,
            mapper: ({ approverUserId: userId }) => ({
              userId
            })
          },
          {
            key: "approverGroupUserId",
            label: "userApprovers" as const,
            mapper: ({ approverGroupUserId: userId }) => ({
              userId
            })
          }
        ]
      });
      return formatedDoc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find" });
    }
  };

  return { ...secretApprovalPolicyOrm, findById, find };
};
