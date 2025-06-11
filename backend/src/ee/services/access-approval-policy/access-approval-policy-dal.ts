import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessApprovalPoliciesSchema, TableName, TAccessApprovalPolicies, TUsers } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, sqlNestRelationships, TFindFilter } from "@app/lib/knex";

import { ApproverType, BypasserType } from "./access-approval-policy-types";

export type TAccessApprovalPolicyDALFactory = ReturnType<typeof accessApprovalPolicyDALFactory>;

export const accessApprovalPolicyDALFactory = (db: TDbClient) => {
  const accessApprovalPolicyOrm = ormify(db, TableName.AccessApprovalPolicy);

  const accessApprovalPolicyFindQuery = async (
    tx: Knex,
    filter: TFindFilter<TAccessApprovalPolicies & { projectId: string }>,
    customFilter?: {
      policyId?: string;
    }
  ) => {
    const result = await tx(TableName.AccessApprovalPolicy)
      // eslint-disable-next-line
      .where(buildFindFilter(filter))
      .where((qb) => {
        if (customFilter?.policyId) {
          void qb.where(`${TableName.AccessApprovalPolicy}.id`, "=", customFilter.policyId);
        }
      })
      .join(TableName.Environment, `${TableName.AccessApprovalPolicy}.envId`, `${TableName.Environment}.id`)
      .leftJoin(
        TableName.AccessApprovalPolicyApprover,
        `${TableName.AccessApprovalPolicy}.id`,
        `${TableName.AccessApprovalPolicyApprover}.policyId`
      )
      .leftJoin(TableName.Users, `${TableName.AccessApprovalPolicyApprover}.approverUserId`, `${TableName.Users}.id`)
      .leftJoin(
        TableName.AccessApprovalPolicyBypasser,
        `${TableName.AccessApprovalPolicy}.id`,
        `${TableName.AccessApprovalPolicyBypasser}.policyId`
      )
      .leftJoin<TUsers>(
        db(TableName.Users).as("bypasserUsers"),
        `${TableName.AccessApprovalPolicyBypasser}.bypasserUserId`,
        `bypasserUsers.id`
      )
      .select(tx.ref("username").withSchema(TableName.Users).as("approverUsername"))
      .select(tx.ref("username").withSchema("bypasserUsers").as("bypasserUsername"))
      .select(tx.ref("approverUserId").withSchema(TableName.AccessApprovalPolicyApprover))
      .select(tx.ref("approverGroupId").withSchema(TableName.AccessApprovalPolicyApprover))
      .select(tx.ref("sequence").withSchema(TableName.AccessApprovalPolicyApprover).as("approverSequence"))
      .select(tx.ref("approvalsRequired").withSchema(TableName.AccessApprovalPolicyApprover))
      .select(tx.ref("approverGroupId").withSchema(TableName.AccessApprovalPolicyApprover))
      .select(tx.ref("bypasserUserId").withSchema(TableName.AccessApprovalPolicyBypasser))
      .select(tx.ref("bypasserGroupId").withSchema(TableName.AccessApprovalPolicyBypasser))
      .select(tx.ref("name").withSchema(TableName.Environment).as("envName"))
      .select(tx.ref("slug").withSchema(TableName.Environment).as("envSlug"))
      .select(tx.ref("id").withSchema(TableName.Environment).as("envId"))
      .select(tx.ref("projectId").withSchema(TableName.Environment))
      .select(selectAllTableCols(TableName.AccessApprovalPolicy));

    return result;
  };

  const findById = async (policyId: string, tx?: Knex) => {
    try {
      const doc = await accessApprovalPolicyFindQuery(tx || db.replicaNode(), {
        [`${TableName.AccessApprovalPolicy}.id` as "id"]: policyId
      });
      const formattedDoc = sqlNestRelationships({
        data: doc,
        key: "id",
        parentMapper: (data) => ({
          environment: {
            id: data.envId,
            name: data.envName,
            slug: data.envSlug
          },
          projectId: data.projectId,
          ...AccessApprovalPoliciesSchema.parse(data)
        }),
        childrenMapper: [
          {
            key: "approverUserId",
            label: "approvers" as const,
            mapper: ({ approverUserId: id, approverSequence, approvalsRequired }) => ({
              id,
              type: "user",
              sequence: approverSequence,
              approvalsRequired
            })
          },
          {
            key: "approverGroupId",
            label: "approvers" as const,
            mapper: ({ approverGroupId: id, approverSequence, approvalsRequired }) => ({
              id,
              type: "group",
              sequence: approverSequence,
              approvalsRequired
            })
          }
        ]
      });

      return formattedDoc?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindById" });
    }
  };

  const find = async (
    filter: TFindFilter<TAccessApprovalPolicies & { projectId: string }>,
    customFilter?: {
      policyId?: string;
    },
    tx?: Knex
  ) => {
    try {
      const docs = await accessApprovalPolicyFindQuery(tx || db.replicaNode(), filter, customFilter);

      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (data) => ({
          environment: {
            id: data.envId,
            name: data.envName,
            slug: data.envSlug
          },
          projectId: data.projectId,
          ...AccessApprovalPoliciesSchema.parse(data)
          // secretPath: data.secretPath || undefined,
        }),
        childrenMapper: [
          {
            key: "approverUserId",
            label: "approvers" as const,
            mapper: ({ approverUserId: id, approverUsername, approverSequence, approvalsRequired }) => ({
              id,
              type: ApproverType.User,
              name: approverUsername,
              sequence: approverSequence,
              approvalsRequired
            })
          },
          {
            key: "approverGroupId",
            label: "approvers" as const,
            mapper: ({ approverGroupId: id, approverSequence, approvalsRequired }) => ({
              id,
              type: ApproverType.Group,
              sequence: approverSequence,
              approvalsRequired
            })
          },
          {
            key: "bypasserUserId",
            label: "bypassers" as const,
            mapper: ({ bypasserUserId: id, bypasserUsername }) => ({
              id,
              type: BypasserType.User,
              name: bypasserUsername
            })
          },
          {
            key: "bypasserGroupId",
            label: "bypassers" as const,
            mapper: ({ bypasserGroupId: id }) => ({
              id,
              type: BypasserType.Group
            })
          }
        ]
      });

      return formattedDocs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find" });
    }
  };

  const softDeleteById = async (policyId: string, tx?: Knex) => {
    const softDeletedPolicy = await accessApprovalPolicyOrm.updateById(policyId, { deletedAt: new Date() }, tx);
    return softDeletedPolicy;
  };

  const findLastValidPolicy = async ({ envId, secretPath }: { envId: string; secretPath: string }, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.AccessApprovalPolicy)
        .where(
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          buildFindFilter(
            {
              envId,
              secretPath
            },
            TableName.AccessApprovalPolicy
          )
        )
        .orderBy("deletedAt", "desc")
        .orderByRaw(`"deletedAt" IS NULL`)
        .first();

      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLastValidPolicy" });
    }
  };

  return { ...accessApprovalPolicyOrm, find, findById, softDeleteById, findLastValidPolicy };
};
