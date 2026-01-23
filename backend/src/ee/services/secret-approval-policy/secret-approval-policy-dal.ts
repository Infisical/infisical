import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { SecretApprovalPoliciesSchema, TSecretApprovalPolicies } from "@app/db/schemas/secret-approval-policies";
import { TUserGroupMembership } from "@app/db/schemas/user-group-membership";
import { TUsers } from "@app/db/schemas/users";
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
      envId?: string;
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
      .join(
        TableName.SecretApprovalPolicyEnvironment,
        `${TableName.SecretApprovalPolicyEnvironment}.policyId`,
        `${TableName.SecretApprovalPolicy}.id`
      )
      .join(TableName.Environment, `${TableName.SecretApprovalPolicyEnvironment}.envId`, `${TableName.Environment}.id`)
      .where((qb) => {
        if (customFilter?.envId) {
          void qb.where(`${TableName.SecretApprovalPolicyEnvironment}.envId`, "=", customFilter.envId);
        }
      })
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
        tx.ref("id").withSchema(TableName.Environment).as("environmentId"),
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
          },
          {
            key: "environmentId",
            label: "environments" as const,
            mapper: ({ environmentId, envName, envSlug }) => ({
              id: environmentId,
              name: envName,
              slug: envSlug
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
      envId?: string;
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
          },
          {
            key: "environmentId",
            label: "environments" as const,
            mapper: ({ environmentId, envName, envSlug }) => ({
              id: environmentId,
              name: envName,
              slug: envSlug
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

  const findPolicyByEnvIdAndSecretPath = async (
    { envIds, secretPath }: { envIds: string[]; secretPath: string },
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretApprovalPolicy)
        .join(
          TableName.SecretApprovalPolicyEnvironment,
          `${TableName.SecretApprovalPolicyEnvironment}.policyId`,
          `${TableName.SecretApprovalPolicy}.id`
        )
        .join(
          TableName.Environment,
          `${TableName.SecretApprovalPolicyEnvironment}.envId`,
          `${TableName.Environment}.id`
        )
        .where(
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          buildFindFilter(
            {
              $in: {
                envId: envIds
              }
            },
            TableName.SecretApprovalPolicyEnvironment
          )
        )
        .where(
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          buildFindFilter(
            {
              secretPath
            },
            TableName.SecretApprovalPolicy
          )
        )
        .whereNull(`${TableName.SecretApprovalPolicy}.deletedAt`)
        .orderBy("deletedAt", "desc")
        .orderByRaw(`"deletedAt" IS NULL`)
        .select(selectAllTableCols(TableName.SecretApprovalPolicy))
        .select(db.ref("name").withSchema(TableName.Environment).as("envName"))
        .select(db.ref("slug").withSchema(TableName.Environment).as("envSlug"))
        .select(db.ref("id").withSchema(TableName.Environment).as("environmentId"))
        .select(db.ref("projectId").withSchema(TableName.Environment));
      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (data) => ({
          projectId: data.projectId,
          ...SecretApprovalPoliciesSchema.parse(data)
        }),
        childrenMapper: [
          {
            key: "environmentId",
            label: "environments" as const,
            mapper: ({ environmentId: id, envName, envSlug }) => ({
              id,
              name: envName,
              slug: envSlug
            })
          }
        ]
      });
      return formattedDocs?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "findPolicyByEnvIdAndSecretPath" });
    }
  };

  return { ...secretApprovalPolicyOrm, findById, find, softDeleteById, findPolicyByEnvIdAndSecretPath };
};
