import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { ApprovalPoliciesSchema, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

import { ApprovalPolicyType, ApproverType } from "./approval-policy-enums";
import { ApprovalPolicyStep, PolicyBypasser } from "./approval-policy-types";

// Approval Policy
export type TApprovalPolicyDALFactory = ReturnType<typeof approvalPolicyDALFactory>;
export const approvalPolicyDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalPolicies);

  const findByIdForUpdate = async (id: string, tx: Knex) => {
    try {
      return await tx(TableName.ApprovalPolicies).where({ id }).forUpdate().first();
    } catch (error) {
      throw new DatabaseError({ error, name: "FindApprovalPolicyByIdForUpdate" });
    }
  };

  const findByIdForShare = async (id: string, tx: Knex) => {
    try {
      return await tx(TableName.ApprovalPolicies).where({ id }).forShare().first();
    } catch (error) {
      throw new DatabaseError({ error, name: "FindApprovalPolicyByIdForShare" });
    }
  };

  const findStepsByPolicyId = async (policyId: string, tx?: Knex) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const steps = await dbInstance(TableName.ApprovalPolicySteps).where({ policyId }).orderBy("stepNumber", "asc");

      if (!steps.length) {
        return [];
      }

      const stepIds = steps.map((step) => step.id);

      const approvers = await dbInstance(TableName.ApprovalPolicyStepApprovers)
        .whereIn("policyStepId", stepIds)
        .select("policyStepId", "userId", "groupId");

      const approversByStepId = approvers.reduce<Record<string, { type: ApproverType; id: string }[]>>(
        (acc, approver) => {
          const stepApprovers = acc[approver.policyStepId] || [];
          stepApprovers.push({
            type: approver.userId ? ApproverType.User : ApproverType.Group,
            id: (approver.userId || approver.groupId) as string
          });
          acc[approver.policyStepId] = stepApprovers;
          return acc;
        },
        {}
      );

      return steps.map((step) => {
        const stepApprovers = approversByStepId[step.id] || [];

        const formattedStep: ApprovalPolicyStep = {
          requiredApprovals: step.requiredApprovals,
          approvers: stepApprovers
        };

        if (step.name) {
          formattedStep.name = step.name;
        }
        if (typeof step.notifyApprovers === "boolean") {
          formattedStep.notifyApprovers = step.notifyApprovers;
        }

        return formattedStep;
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find approval policy steps" });
    }
  };

  const findBypassersByPolicyId = async (policyId: string, tx?: Knex): Promise<PolicyBypasser[]> => {
    try {
      const dbInstance = tx || db.replicaNode();
      const rows = (await dbInstance(TableName.ApprovalPolicyBypassers)
        .where({ policyId })
        .select("userId", "groupId")) as { userId: string | null; groupId: string | null }[];

      return rows.map((row) => ({
        type: row.userId ? ApproverType.User : ApproverType.Group,
        id: (row.userId || row.groupId) as string
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find approval policy bypassers" });
    }
  };

  const findBypassersByPolicyIds = async (policyIds: string[]): Promise<Record<string, PolicyBypasser[]>> => {
    if (!policyIds.length) return {};
    try {
      const dbInstance = db.replicaNode();
      const rows = (await dbInstance(TableName.ApprovalPolicyBypassers)
        .whereIn("policyId", policyIds)
        .select("policyId", "userId", "groupId")) as {
        policyId: string;
        userId: string | null;
        groupId: string | null;
      }[];

      return rows.reduce<Record<string, PolicyBypasser[]>>((acc, row) => {
        const list = acc[row.policyId] || [];
        list.push({
          type: row.userId ? ApproverType.User : ApproverType.Group,
          id: (row.userId || row.groupId) as string
        });
        acc[row.policyId] = list;
        return acc;
      }, {});
    } catch (error) {
      throw new DatabaseError({ error, name: "Find approval policy bypassers by policy ids" });
    }
  };

  const findByProjectId = async (
    policyType: ApprovalPolicyType,
    projectId: string,
    options?: { scopeType?: string | null; scopeId?: string | null }
  ) => {
    try {
      const dbInstance = db.replicaNode();
      const baseQuery = dbInstance(TableName.ApprovalPolicies)
        .where({ type: policyType, projectId })
        .orderBy("id", "asc");

      if (options?.scopeType === null) {
        void baseQuery.whereNull("scopeType");
      } else if (typeof options?.scopeType === "string") {
        void baseQuery.where({ scopeType: options.scopeType });
        if (typeof options?.scopeId === "string") {
          void baseQuery.where({ scopeId: options.scopeId });
        }
      }

      const policies = await baseQuery;

      if (!policies.length) {
        return [];
      }

      const policyIds = policies.map((p) => p.id);

      const steps = await dbInstance(TableName.ApprovalPolicySteps)
        .whereIn("policyId", policyIds)
        .orderBy("stepNumber", "asc");

      const bypassers = (await dbInstance(TableName.ApprovalPolicyBypassers)
        .whereIn("policyId", policyIds)
        .select("policyId", "userId", "groupId")) as {
        policyId: string;
        userId: string | null;
        groupId: string | null;
      }[];

      const bypassersByPolicyId = bypassers.reduce<Record<string, PolicyBypasser[]>>((acc, row) => {
        const list = acc[row.policyId] || [];
        list.push({
          type: row.userId ? ApproverType.User : ApproverType.Group,
          id: (row.userId || row.groupId) as string
        });
        acc[row.policyId] = list;
        return acc;
      }, {});

      const stepsByPolicyId: Record<string, ApprovalPolicyStep[]> = {};

      if (steps.length) {
        const stepIds = steps.map((step) => step.id);

        const approvers = await dbInstance(TableName.ApprovalPolicyStepApprovers)
          .whereIn("policyStepId", stepIds)
          .select("policyStepId", "userId", "groupId");

        const approversByStepId = approvers.reduce<Record<string, { type: ApproverType; id: string }[]>>(
          (acc, approver) => {
            const stepApprovers = acc[approver.policyStepId] || [];
            stepApprovers.push({
              type: approver.userId ? ApproverType.User : ApproverType.Group,
              id: (approver.userId || approver.groupId) as string
            });
            acc[approver.policyStepId] = stepApprovers;
            return acc;
          },
          {}
        );

        steps.forEach((step) => {
          const stepApprovers = approversByStepId[step.id] || [];
          const formattedStep: ApprovalPolicyStep = {
            requiredApprovals: step.requiredApprovals,
            approvers: stepApprovers
          };

          if (step.name) {
            formattedStep.name = step.name;
          }
          if (typeof step.notifyApprovers === "boolean") {
            formattedStep.notifyApprovers = step.notifyApprovers;
          }

          if (!stepsByPolicyId[step.policyId]) {
            stepsByPolicyId[step.policyId] = [];
          }
          stepsByPolicyId[step.policyId].push(formattedStep);
        });
      }

      return policies.map((policy) => ({
        ...policy,
        steps: stepsByPolicyId[policy.id] || [],
        bypassers: bypassersByPolicyId[policy.id] || []
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find approval policies by project id" });
    }
  };

  const findSecretAccessPolicyByEnvIdAndSecretPath = async ({
    projectId,
    envId,
    secretPath
  }: {
    projectId: string;
    envId: string;
    secretPath: string;
  }) => {
    try {
      const policy = await db
        .replicaNode()(TableName.ApprovalPolicies)
        .join(
          TableName.ApprovalPolicySecretEnvironment,
          `${TableName.ApprovalPolicySecretEnvironment}.policyId`,
          `${TableName.ApprovalPolicies}.id`
        )
        .where(`${TableName.ApprovalPolicies}.type`, ApprovalPolicyType.SecretAccess)
        .where(`${TableName.ApprovalPolicies}.projectId`, projectId)
        .where(`${TableName.ApprovalPolicySecretEnvironment}.envId`, envId)
        .where(`${TableName.ApprovalPolicySecretEnvironment}.secretPath`, secretPath)
        .select(selectAllTableCols(TableName.ApprovalPolicies))
        .first();

      if (!policy) return null;

      const [steps, bypassers] = await Promise.all([
        findStepsByPolicyId(policy.id),
        findBypassersByPolicyId(policy.id)
      ]);

      return { ...policy, steps, bypassers };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret access approval policy by environment and secret path" });
    }
  };

  /**
   * Return the list of policies (with name + id) in a project or an organization that include any of the
   * given subjects as an approver on any step. The subjects are identified by `userIds` OR `groupId` (not
   * both). Used to block removing members while they're still wired up as reviewers.
   */
  const findPoliciesWhereSubjectIsApprover = async (
    args: {
      type?: ApprovalPolicyType;
      scopeType?: string;
      scopeId?: string;
      userIds?: string[];
      groupId?: string;
    } & ({ projectId: string; organizationId?: undefined } | { projectId?: undefined; organizationId: string })
  ) => {
    try {
      const dbInstance = db.replicaNode();

      const baseQuery = dbInstance(TableName.ApprovalPolicies)
        .innerJoin(
          TableName.ApprovalPolicySteps,
          `${TableName.ApprovalPolicySteps}.policyId`,
          `${TableName.ApprovalPolicies}.id`
        )
        .innerJoin(
          TableName.ApprovalPolicyStepApprovers,
          `${TableName.ApprovalPolicyStepApprovers}.policyStepId`,
          `${TableName.ApprovalPolicySteps}.id`
        );

      if (args.projectId) {
        void baseQuery.where(`${TableName.ApprovalPolicies}.projectId`, args.projectId);
      } else if (args.organizationId) {
        void baseQuery.where(`${TableName.ApprovalPolicies}.organizationId`, args.organizationId);
      } else {
        return [];
      }

      if (args.type) {
        void baseQuery.where(`${TableName.ApprovalPolicies}.type`, args.type);
      }

      if (typeof args.scopeType === "string") {
        void baseQuery.where(`${TableName.ApprovalPolicies}.scopeType`, args.scopeType);
        if (typeof args.scopeId === "string") {
          void baseQuery.where(`${TableName.ApprovalPolicies}.scopeId`, args.scopeId);
        }
      }

      if (args.userIds?.length) {
        void baseQuery.whereIn(`${TableName.ApprovalPolicyStepApprovers}.userId`, args.userIds);
      } else if (args.groupId) {
        void baseQuery.where(`${TableName.ApprovalPolicyStepApprovers}.groupId`, args.groupId);
      } else {
        return [];
      }

      const rows = await baseQuery
        .distinct(`${TableName.ApprovalPolicies}.id`, `${TableName.ApprovalPolicies}.name`)
        .select<{ id: string; name: string }[]>();

      return rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find policies where subject is approver" });
    }
  };

  // Single-query check: is the user (directly, or via any of their groups) an approver
  // on any policy in the project? Used to gate approver-only UI.
  const isProjectApprover = async (args: {
    projectId: string;
    userId: string;
    groupIds: string[];
    type?: string;
    scopeType?: string;
  }): Promise<boolean> => {
    try {
      const dbInstance = db.replicaNode();

      const query = dbInstance(TableName.ApprovalPolicies)
        .where(`${TableName.ApprovalPolicies}.projectId`, args.projectId)
        .innerJoin(
          TableName.ApprovalPolicySteps,
          `${TableName.ApprovalPolicySteps}.policyId`,
          `${TableName.ApprovalPolicies}.id`
        )
        .innerJoin(
          TableName.ApprovalPolicyStepApprovers,
          `${TableName.ApprovalPolicyStepApprovers}.policyStepId`,
          `${TableName.ApprovalPolicySteps}.id`
        );

      if (typeof args.type === "string") {
        void query.where(`${TableName.ApprovalPolicies}.type`, args.type);
      }
      if (typeof args.scopeType === "string") {
        void query.where(`${TableName.ApprovalPolicies}.scopeType`, args.scopeType);
      }

      void query.where((qb) => {
        void qb.where(`${TableName.ApprovalPolicyStepApprovers}.userId`, args.userId);
        if (args.groupIds.length) {
          void qb.orWhereIn(`${TableName.ApprovalPolicyStepApprovers}.groupId`, args.groupIds);
        }
      });

      const row = (await query.select(`${TableName.ApprovalPolicies}.id`).first()) as { id: string } | undefined;
      return Boolean(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Check project approver" });
    }
  };

  // Of the given scopes, return those whose policy actually has at least one approver configured.
  // A policy row with no approvers does not count as "configured".
  const findScopeIdsWithApprovers = async (args: {
    type: string;
    scopeType: string;
    scopeIds: string[];
  }): Promise<string[]> => {
    try {
      if (!args.scopeIds.length) return [];
      const dbInstance = db.replicaNode();

      const rows = (await dbInstance(TableName.ApprovalPolicies)
        .where(`${TableName.ApprovalPolicies}.type`, args.type)
        .where(`${TableName.ApprovalPolicies}.scopeType`, args.scopeType)
        .whereIn(`${TableName.ApprovalPolicies}.scopeId`, args.scopeIds)
        .innerJoin(
          TableName.ApprovalPolicySteps,
          `${TableName.ApprovalPolicySteps}.policyId`,
          `${TableName.ApprovalPolicies}.id`
        )
        .innerJoin(
          TableName.ApprovalPolicyStepApprovers,
          `${TableName.ApprovalPolicyStepApprovers}.policyStepId`,
          `${TableName.ApprovalPolicySteps}.id`
        )
        .distinct(`${TableName.ApprovalPolicies}.scopeId`)
        .select<{ scopeId: string | null }[]>(`${TableName.ApprovalPolicies}.scopeId`)) as {
        scopeId: string | null;
      }[];

      return rows.map((r) => r.scopeId).filter((id): id is string => Boolean(id));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find scope ids with approvers" });
    }
  };

  const deleteBypassersBySubject = async (
    args: {
      projectId: string;
      scopeType?: string;
      scopeId?: string;
      userId?: string;
      groupId?: string;
    },
    tx?: Knex
  ): Promise<void> => {
    try {
      if (!args.userId && !args.groupId) return;

      const conn = tx || db;

      const policyIdsQuery = conn(TableName.ApprovalPolicies).where(
        `${TableName.ApprovalPolicies}.projectId`,
        args.projectId
      );

      if (typeof args.scopeType === "string") {
        void policyIdsQuery.where(`${TableName.ApprovalPolicies}.scopeType`, args.scopeType);
        if (typeof args.scopeId === "string") {
          void policyIdsQuery.where(`${TableName.ApprovalPolicies}.scopeId`, args.scopeId);
        }
      }

      const policyIds = (await policyIdsQuery.select<{ id: string }[]>(`${TableName.ApprovalPolicies}.id`)).map(
        (p) => p.id
      );
      if (policyIds.length === 0) return;

      const deleteQuery = conn(TableName.ApprovalPolicyBypassers).whereIn("policyId", policyIds);
      if (args.userId) {
        void deleteQuery.andWhere("userId", args.userId);
      } else if (args.groupId) {
        void deleteQuery.andWhere("groupId", args.groupId);
      }
      await deleteQuery.delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete bypassers by subject" });
    }
  };

  const deleteStepApproversBySubject = async (
    args: {
      projectId: string;
      scopeType?: string;
      scopeId?: string;
      userId?: string;
      groupId?: string;
    },
    tx?: Knex
  ): Promise<{ id: string; name: string }[]> => {
    try {
      if (!args.userId && !args.groupId) return [];

      const conn = tx || db;

      const policiesToTouchQuery = conn(TableName.ApprovalPolicies)
        .where(`${TableName.ApprovalPolicies}.projectId`, args.projectId)
        .innerJoin(
          TableName.ApprovalPolicySteps,
          `${TableName.ApprovalPolicySteps}.policyId`,
          `${TableName.ApprovalPolicies}.id`
        )
        .innerJoin(
          TableName.ApprovalPolicyStepApprovers,
          `${TableName.ApprovalPolicyStepApprovers}.policyStepId`,
          `${TableName.ApprovalPolicySteps}.id`
        );

      if (typeof args.scopeType === "string") {
        void policiesToTouchQuery.where(`${TableName.ApprovalPolicies}.scopeType`, args.scopeType);
        if (typeof args.scopeId === "string") {
          void policiesToTouchQuery.where(`${TableName.ApprovalPolicies}.scopeId`, args.scopeId);
        }
      }

      if (args.userId) {
        void policiesToTouchQuery.where(`${TableName.ApprovalPolicyStepApprovers}.userId`, args.userId);
      } else if (args.groupId) {
        void policiesToTouchQuery.where(`${TableName.ApprovalPolicyStepApprovers}.groupId`, args.groupId);
      }

      const affectedPolicies = (await policiesToTouchQuery
        .distinct(`${TableName.ApprovalPolicies}.id`, `${TableName.ApprovalPolicies}.name`)
        .select<{ id: string; name: string }[]>()) as { id: string; name: string }[];

      if (affectedPolicies.length === 0) return [];

      const affectedPolicyIds = affectedPolicies.map((p) => p.id);

      const stepIds = (
        await conn(TableName.ApprovalPolicySteps).whereIn("policyId", affectedPolicyIds).select<{ id: string }[]>("id")
      ).map((s) => s.id);

      if (stepIds.length === 0) return affectedPolicies;

      const deleteQuery = conn(TableName.ApprovalPolicyStepApprovers).whereIn("policyStepId", stepIds);
      if (args.userId) {
        void deleteQuery.andWhere("userId", args.userId);
      } else if (args.groupId) {
        void deleteQuery.andWhere("groupId", args.groupId);
      }
      await deleteQuery.delete();

      return affectedPolicies;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete step approvers by subject" });
    }
  };

  const deleteUserStepApproversInProjects = async (
    args: { projectIds: string[]; userIds: string[]; scopeTypes: string[] },
    tx?: Knex
  ): Promise<void> => {
    try {
      if (!args.projectIds.length || !args.userIds.length || !args.scopeTypes.length) return;

      const conn = tx || db;

      const stepIds = conn(TableName.ApprovalPolicies)
        .whereIn(`${TableName.ApprovalPolicies}.projectId`, args.projectIds)
        .whereIn(`${TableName.ApprovalPolicies}.scopeType`, args.scopeTypes)
        .innerJoin(
          TableName.ApprovalPolicySteps,
          `${TableName.ApprovalPolicySteps}.policyId`,
          `${TableName.ApprovalPolicies}.id`
        )
        .select(`${TableName.ApprovalPolicySteps}.id`);

      await conn(TableName.ApprovalPolicyStepApprovers)
        .whereIn("policyStepId", stepIds)
        .whereIn("userId", args.userIds)
        .delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete user step approvers in projects" });
    }
  };

  return {
    ...orm,
    findByIdForUpdate,
    findByIdForShare,
    findStepsByPolicyId,
    findBypassersByPolicyId,
    findBypassersByPolicyIds,
    findByProjectId,
    findSecretAccessPolicyByEnvIdAndSecretPath,
    findPoliciesWhereSubjectIsApprover,
    isProjectApprover,
    findScopeIdsWithApprovers,
    deleteStepApproversBySubject,
    deleteBypassersBySubject,
    deleteUserStepApproversInProjects
  };
};

// Approval Policy Steps
export type TApprovalPolicyStepsDALFactory = ReturnType<typeof approvalPolicyStepsDALFactory>;
export const approvalPolicyStepsDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalPolicySteps);
  return orm;
};

// Approval Policy Step Approvers
export type TApprovalPolicyStepApproversDALFactory = ReturnType<typeof approvalPolicyStepApproversDALFactory>;
export const approvalPolicyStepApproversDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalPolicyStepApprovers);
  return orm;
};

// Approval Policy Bypassers
export type TApprovalPolicyBypassersDALFactory = ReturnType<typeof approvalPolicyBypassersDALFactory>;
export const approvalPolicyBypassersDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalPolicyBypassers);
  return orm;
};

// Approval Policy Secret Environments
export type TApprovalPolicySecretEnvironmentDALFactory = ReturnType<typeof approvalPolicySecretEnvironmentDALFactory>;
export const approvalPolicySecretEnvironmentDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalPolicySecretEnvironment);

  const findPolicyByEnvIdsAndSecretPath = async (
    { envIds, secretPath, excludePolicyId }: { envIds: string[]; secretPath: string; excludePolicyId?: string },
    tx?: Knex
  ) => {
    try {
      const doc = (await (tx || db.replicaNode())(TableName.ApprovalPolicySecretEnvironment)
        .join(
          TableName.ApprovalPolicies,
          `${TableName.ApprovalPolicies}.id`,
          `${TableName.ApprovalPolicySecretEnvironment}.policyId`
        )
        .where(`${TableName.ApprovalPolicies}.type`, ApprovalPolicyType.SecretAccess)
        .where((qb) => {
          if (excludePolicyId) void qb.whereNot(`${TableName.ApprovalPolicies}.id`, excludePolicyId);
        })
        .whereIn(`${TableName.ApprovalPolicySecretEnvironment}.envId`, envIds)
        .where(`${TableName.ApprovalPolicySecretEnvironment}.secretPath`, secretPath)
        .select(
          db.ref("id").withSchema(TableName.ApprovalPolicies).as("policyId"),
          db.ref("name").withSchema(TableName.ApprovalPolicies).as("policyName"),
          db.ref("envId").withSchema(TableName.ApprovalPolicySecretEnvironment)
        )
        .first()) as { policyId: string; policyName: string; envId: string } | undefined;

      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find approval policy by env ids and secret path" });
    }
  };

  const findSecretChangePolicyByEnvIdsAndSecretPath = async (
    { envIds, secretPath, excludePolicyId }: { envIds: string[]; secretPath: string; excludePolicyId?: string },
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.ApprovalPolicies)
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
        .where(`${TableName.ApprovalPolicies}.type`, ApprovalPolicyType.SecretChange)
        .whereIn(`${TableName.ApprovalPolicySecretEnvironment}.envId`, envIds)
        .where(`${TableName.ApprovalPolicySecretEnvironment}.secretPath`, secretPath)
        .where((qb) => {
          if (excludePolicyId) void qb.whereNot(`${TableName.ApprovalPolicies}.id`, excludePolicyId);
        })
        .select(selectAllTableCols(TableName.ApprovalPolicies))
        .select(db.ref("name").withSchema(TableName.Environment).as("envName"))
        .select(db.ref("slug").withSchema(TableName.Environment).as("envSlug"))
        .select(db.ref("id").withSchema(TableName.Environment).as("environmentId"));

      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (data) => ApprovalPoliciesSchema.parse(data),
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
      throw new DatabaseError({ error, name: "Find secret change approval policy by env ids and secret path" });
    }
  };

  const findPolicyByEnvId = async (envId: string, tx?: Knex) => {
    try {
      const doc = (await (tx || db.replicaNode())(TableName.ApprovalPolicySecretEnvironment)
        .join(
          TableName.ApprovalPolicies,
          `${TableName.ApprovalPolicies}.id`,
          `${TableName.ApprovalPolicySecretEnvironment}.policyId`
        )
        .where(`${TableName.ApprovalPolicySecretEnvironment}.envId`, envId)
        .select(
          db.ref("name").withSchema(TableName.ApprovalPolicies).as("policyName"),
          db.ref("type").withSchema(TableName.ApprovalPolicies).as("policyType")
        )
        .first()) as { policyName: string; policyType: ApprovalPolicyType } | undefined;

      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find approval policy by env id" });
    }
  };

  const findByPolicyIdForUpdate = async (policyId: string, tx: Knex) => {
    try {
      return await tx(TableName.ApprovalPolicySecretEnvironment).forUpdate().where({ policyId }).orderBy("id", "asc");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find approval policy secret environments by policy id for update" });
    }
  };

  return {
    ...orm,
    findPolicyByEnvIdsAndSecretPath,
    findSecretChangePolicyByEnvIdsAndSecretPath,
    findPolicyByEnvId,
    findByPolicyIdForUpdate
  };
};
