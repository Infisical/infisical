import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { ApprovalPoliciesSchema, TableName, TUsers } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

import { ApproverType, BypasserType } from "../access-approval-policy/access-approval-policy-types";

export type TSecretChangeGlobalPolicyBridgeDALFactory = ReturnType<typeof secretChangeGlobalPolicyBridgeDALFactory>;

export type TSecretChangePolicyRow = Awaited<
  ReturnType<TSecretChangeGlobalPolicyBridgeDALFactory["findSecretChangePolicies"]>
>[number];

export const secretChangeGlobalPolicyBridgeDALFactory = (db: TDbClient) => {
  const findSecretChangePolicies = async (
    {
      policyId,
      projectId,
      envId,
      organizationId
    }: { policyId?: string; projectId?: string; envId?: string; organizationId?: string },
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.ApprovalPolicies)
        .where(`${TableName.ApprovalPolicies}.type`, ApprovalPolicyType.SecretChange)
        .where((qb) => {
          if (policyId) void qb.where(`${TableName.ApprovalPolicies}.id`, policyId);
          if (projectId) void qb.where(`${TableName.ApprovalPolicies}.projectId`, projectId);
          if (organizationId) void qb.where(`${TableName.ApprovalPolicies}.organizationId`, organizationId);
        })
        .join(
          TableName.ApprovalPolicySecretEnvironment,
          `${TableName.ApprovalPolicySecretEnvironment}.policyId`,
          `${TableName.ApprovalPolicies}.id`
        )
        .join(TableName.Environment, function joinActiveEnvForSecretChangePolicy() {
          this.on(`${TableName.ApprovalPolicySecretEnvironment}.envId`, `${TableName.Environment}.id`).andOnNull(
            `${TableName.Environment}.deleteAfter`
          );
        })
        .where((qb) => {
          if (envId) void qb.where(`${TableName.ApprovalPolicySecretEnvironment}.envId`, envId);
        })
        .leftJoin(
          TableName.ApprovalPolicySteps,
          `${TableName.ApprovalPolicySteps}.policyId`,
          `${TableName.ApprovalPolicies}.id`
        )
        .leftJoin(
          TableName.ApprovalPolicyStepApprovers,
          `${TableName.ApprovalPolicyStepApprovers}.policyStepId`,
          `${TableName.ApprovalPolicySteps}.id`
        )
        .leftJoin<TUsers>(
          db(TableName.Users).as("approverUser"),
          `${TableName.ApprovalPolicyStepApprovers}.userId`,
          "approverUser.id"
        )
        .leftJoin(
          TableName.UserGroupMembership,
          `${TableName.ApprovalPolicyStepApprovers}.groupId`,
          `${TableName.UserGroupMembership}.groupId`
        )
        .leftJoin(
          TableName.ApprovalPolicyBypassers,
          `${TableName.ApprovalPolicyBypassers}.policyId`,
          `${TableName.ApprovalPolicies}.id`
        )
        .leftJoin<TUsers>(
          db(TableName.Users).as("bypasserUser"),
          `${TableName.ApprovalPolicyBypassers}.userId`,
          "bypasserUser.id"
        )
        .select(selectAllTableCols(TableName.ApprovalPolicies))
        .select(
          db.ref("id").withSchema(TableName.Environment).as("environmentId"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("secretPath").withSchema(TableName.ApprovalPolicySecretEnvironment).as("envSecretPath"),
          db.ref("id").withSchema(TableName.ApprovalPolicySteps).as("stepId"),
          db.ref("stepNumber").withSchema(TableName.ApprovalPolicySteps),
          db.ref("requiredApprovals").withSchema(TableName.ApprovalPolicySteps),
          db.ref("userId").withSchema(TableName.ApprovalPolicyStepApprovers).as("approverUserId"),
          db.ref("groupId").withSchema(TableName.ApprovalPolicyStepApprovers).as("approverGroupId"),
          db.ref("username").withSchema("approverUser").as("approverUsername"),
          db.ref("userId").withSchema(TableName.UserGroupMembership).as("approverGroupUserId"),
          db.ref("userId").withSchema(TableName.ApprovalPolicyBypassers).as("bypasserUserId"),
          db.ref("groupId").withSchema(TableName.ApprovalPolicyBypassers).as("bypasserGroupId"),
          db.ref("username").withSchema("bypasserUser").as("bypasserUsername")
        )
        .orderBy([
          { column: `${TableName.ApprovalPolicies}.createdAt`, order: "asc" },
          { column: `${TableName.ApprovalPolicies}.id`, order: "asc" },
          { column: `${TableName.Environment}.position`, order: "asc" },
          { column: `${TableName.ApprovalPolicySteps}.stepNumber`, order: "asc" }
        ]);

      return sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (data) => ({
          ...ApprovalPoliciesSchema.parse(data),
          secretPath: data.envSecretPath
        }),
        childrenMapper: [
          {
            key: "environmentId",
            label: "environments" as const,
            mapper: ({ environmentId: id, envName, envSlug }) => ({ id, name: envName, slug: envSlug })
          },
          {
            key: "stepId",
            label: "steps" as const,
            mapper: ({ stepId: id, stepNumber, requiredApprovals }) => ({
              id,
              stepNumber: stepNumber as number,
              requiredApprovals: requiredApprovals as number
            })
          },
          {
            key: "approverUserId",
            label: "approvers" as const,
            mapper: ({ approverUserId: id, approverUsername }) => ({
              type: ApproverType.User as const,
              id,
              username: approverUsername
            })
          },
          {
            key: "approverGroupId",
            label: "approvers" as const,
            mapper: ({ approverGroupId: id }) => ({ type: ApproverType.Group as const, id })
          },
          {
            key: "bypasserUserId",
            label: "bypassers" as const,
            mapper: ({ bypasserUserId: id, bypasserUsername }) => ({
              type: BypasserType.User as const,
              id,
              username: bypasserUsername
            })
          },
          {
            key: "bypasserGroupId",
            label: "bypassers" as const,
            mapper: ({ bypasserGroupId: id }) => ({ type: BypasserType.Group as const, id })
          },
          {
            key: "approverUserId",
            label: "userApprovers" as const,
            mapper: ({ approverUserId: userId }) => ({ userId })
          },
          {
            key: "approverGroupUserId",
            label: "userApprovers" as const,
            mapper: ({ approverGroupUserId: userId }) => ({ userId })
          }
        ]
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "findSecretChangePolicies" });
    }
  };

  return { findSecretChangePolicies };
};
