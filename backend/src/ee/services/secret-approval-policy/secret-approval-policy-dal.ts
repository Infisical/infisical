import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  SecretApprovalPoliciesSchema,
  TableName,
  TSecretApprovalPolicies,
  TUserGroupMembership,
  TUsers
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, sqlNestRelationships, TFindFilter } from "@app/lib/knex";

import { ApproverType, BypasserType } from "../access-approval-policy/access-approval-policy-types";

export type TSecretApprovalPolicyDALFactory = ReturnType<typeof secretApprovalPolicyDALFactory>;

export const secretApprovalPolicyDALFactory = (db: TDbClient) => {
  const secretApprovalPolicyOrm = ormify(db, TableName.SecretApprovalPolicy);

  const secretApprovalPolicyFindQuery = (
    tx: Knex,
    filter: TFindFilter<TSecretApprovalPolicies & { projectId: string }>,
    customFilter?: {
      sapId?: string;
    }
  ) =>
    tx(TableName.SecretApprovalPolicy)
      // eslint-disable-next-line
      .where(buildFindFilter(filter))
      .where((qb) => {
        if (customFilter?.sapId) {
          void qb.where(`${TableName.SecretApprovalPolicy}.id`, "=", customFilter.sapId);
        }
      })
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
      // Bypasser
      .leftJoin(
        TableName.SecretApprovalPolicyBypasser,
        `${TableName.SecretApprovalPolicy}.id`,
        `${TableName.SecretApprovalPolicyBypasser}.policyId`
      )
      .leftJoin<TUserGroupMembership>(
        db(TableName.UserGroupMembership).as("bypasserUserGroupMembership"),
        `${TableName.SecretApprovalPolicyBypasser}.bypasserGroupId`,
        `bypasserUserGroupMembership.groupId`
      )
      .leftJoin<TUsers>(
        db(TableName.Users).as("secretApprovalPolicyBypasserUser"),
        `${TableName.SecretApprovalPolicyBypasser}.bypasserUserId`,
        "secretApprovalPolicyBypasserUser.id"
      )
      .leftJoin<TUsers>(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
      .select(
        tx.ref("id").withSchema("secretApprovalPolicyApproverUser").as("approverUserId"),
        tx.ref("email").withSchema("secretApprovalPolicyApproverUser").as("approverEmail"),
        tx.ref("firstName").withSchema("secretApprovalPolicyApproverUser").as("approverFirstName"),
        tx.ref("username").withSchema("secretApprovalPolicyApproverUser").as("approverUsername"),
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
        tx.ref("id").withSchema("secretApprovalPolicyBypasserUser").as("bypasserUserId"),
        tx.ref("email").withSchema("secretApprovalPolicyBypasserUser").as("bypasserEmail"),
        tx.ref("firstName").withSchema("secretApprovalPolicyBypasserUser").as("bypasserFirstName"),
        tx.ref("username").withSchema("secretApprovalPolicyBypasserUser").as("bypasserUsername"),
        tx.ref("lastName").withSchema("secretApprovalPolicyBypasserUser").as("bypasserLastName")
      )
      .select(
        tx.ref("bypasserGroupId").withSchema(TableName.SecretApprovalPolicyBypasser),
        tx.ref("userId").withSchema("bypasserUserGroupMembership").as("bypasserGroupUserId"),
        tx.ref("email").withSchema(TableName.Users).as("bypasserGroupEmail"),
        tx.ref("firstName").withSchema(TableName.Users).as("bypasserGroupFirstName"),
        tx.ref("lastName").withSchema(TableName.Users).as("bypasserGroupLastName")
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

  const find = async (
    filter: TFindFilter<TSecretApprovalPolicies & { projectId: string }>,
    customFilter?: {
      sapId?: string;
    },
    tx?: Knex
  ) => {
    try {
      const docs = await secretApprovalPolicyFindQuery(tx || db.replicaNode(), filter, customFilter);
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
            mapper: ({ approverUserId: id, approverUsername }) => ({
              type: ApproverType.User,
              username: approverUsername,
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
            key: "bypasserUserId",
            label: "bypassers" as const,
            mapper: ({ bypasserUserId: id, bypasserUsername }) => ({
              type: BypasserType.User,
              username: bypasserUsername,
              id
            })
          },
          {
            key: "bypasserGroupId",
            label: "bypassers" as const,
            mapper: ({ bypasserGroupId: id }) => ({
              type: BypasserType.Group,
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

  const softDeleteById = async (policyId: string, tx?: Knex) => {
    const softDeletedPolicy = await secretApprovalPolicyOrm.updateById(policyId, { deletedAt: new Date() }, tx);
    return softDeletedPolicy;
  };

  return { ...secretApprovalPolicyOrm, findById, find, softDeleteById };
};
