import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessApprovalPoliciesSchema, TAccessApprovalPolicies } from "@app/db/schemas/access-approval-policies";
import { TableName } from "@app/db/schemas/models";
import { TUsers } from "@app/db/schemas/users";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, sqlNestRelationships, TFindFilter, TOrmify } from "@app/lib/knex";

import {
  ApproverType,
  BypasserType,
  TCreateAccessApprovalPolicy,
  TDeleteAccessApprovalPolicy,
  TGetAccessApprovalPolicyByIdDTO,
  TGetAccessPolicyCountByEnvironmentDTO,
  TListAccessApprovalPoliciesDTO,
  TUpdateAccessApprovalPolicy
} from "./access-approval-policy-types";

export interface TAccessApprovalPolicyDALFactory
  extends Omit<TOrmify<TableName.AccessApprovalPolicy>, "findById" | "find"> {
  find: (
    filter: TFindFilter<
      TAccessApprovalPolicies & {
        projectId: string;
      }
    >,
    customFilter?: {
      policyId?: string;
      envId?: string;
    },
    tx?: Knex
  ) => Promise<
    {
      approvers: (
        | {
            id: string | null | undefined;
            type: ApproverType.User;
            name: string;
            sequence: number | null | undefined;
            approvalsRequired: number | null | undefined;
          }
        | {
            id: string | null | undefined;
            type: ApproverType.Group;
            sequence: number | null | undefined;
            approvalsRequired: number | null | undefined;
          }
      )[];
      name: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      approvals: number;
      envId: string;
      enforcementLevel: string;
      allowedSelfApprovals: boolean;
      secretPath: string;
      deletedAt?: Date | null | undefined;
      maxTimePeriod?: string | null;
      projectId: string;
      bypassers: (
        | {
            id: string | null | undefined;
            type: BypasserType.User;
            name: string;
          }
        | {
            id: string | null | undefined;
            type: BypasserType.Group;
          }
      )[];
      environments: {
        id: string;
        name: string;
        slug: string;
      }[];
    }[]
  >;
  findById: (
    policyId: string,
    tx?: Knex
  ) => Promise<
    | {
        approvers: {
          id: string | null | undefined;
          type: string;
          sequence: number | null | undefined;
          approvalsRequired: number | null | undefined;
        }[];
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        approvals: number;
        envId: string;
        enforcementLevel: string;
        allowedSelfApprovals: boolean;
        secretPath: string;
        deletedAt?: Date | null | undefined;
        maxTimePeriod?: string | null;
        environments: {
          id: string;
          name: string;
          slug: string;
        }[];
        projectId: string;
      }
    | undefined
  >;
  softDeleteById: (
    policyId: string,
    tx?: Knex
  ) => Promise<{
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    approvals: number;
    envId: string;
    enforcementLevel: string;
    allowedSelfApprovals: boolean;
    secretPath: string;
    deletedAt?: Date | null | undefined;
  }>;
  findLastValidPolicy: (
    {
      envId,
      secretPath
    }: {
      envId: string;
      secretPath: string;
    },
    tx?: Knex
  ) => Promise<
    | {
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        approvals: number;
        envId: string;
        enforcementLevel: string;
        allowedSelfApprovals: boolean;
        secretPath: string;
        deletedAt?: Date | null | undefined;
        maxTimePeriod?: string | null;
      }
    | undefined
  >;
  findPolicyByEnvIdAndSecretPath: (
    { envIds, secretPath }: { envIds: string[]; secretPath: string },
    tx?: Knex
  ) => Promise<{
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    approvals: number;
    enforcementLevel: string;
    allowedSelfApprovals: boolean;
    secretPath: string;
    deletedAt?: Date | null | undefined;
    environments: {
      id: string;
      name: string;
      slug: string;
    }[];
    projectId: string;
  }>;
}

export interface TAccessApprovalPolicyServiceFactory {
  getAccessPolicyCountByEnvSlug: ({
    actor,
    actorOrgId,
    actorAuthMethod,
    projectSlug,
    actorId,
    envSlug
  }: TGetAccessPolicyCountByEnvironmentDTO) => Promise<{
    count: number;
  }>;
  createAccessApprovalPolicy: ({
    name,
    actor,
    actorId,
    actorOrgId,
    secretPath,
    actorAuthMethod,
    approvals,
    approvers,
    bypassers,
    projectSlug,
    environment,
    enforcementLevel,
    allowedSelfApprovals,
    approvalsRequired
  }: TCreateAccessApprovalPolicy) => Promise<{
    environment: {
      name: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      projectId: string;
      slug: string;
      position: number;
    };
    projectId: string;
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    approvals: number;
    envId: string;
    enforcementLevel: string;
    allowedSelfApprovals: boolean;
    secretPath: string;
    deletedAt?: Date | null | undefined;
  }>;
  deleteAccessApprovalPolicy: ({
    policyId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteAccessApprovalPolicy) => Promise<{
    approvers: {
      id: string | null | undefined;
      type: string;
      sequence: number | null | undefined;
      approvalsRequired: number | null | undefined;
    }[];
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    approvals: number;
    envId: string;
    enforcementLevel: string;
    allowedSelfApprovals: boolean;
    secretPath: string;
    deletedAt?: Date | null | undefined;
    environment: {
      id: string;
      name: string;
      slug: string;
    };
    projectId: string;
  }>;
  updateAccessApprovalPolicy: ({
    policyId,
    approvers,
    bypassers,
    secretPath,
    name,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    approvals,
    enforcementLevel,
    allowedSelfApprovals,
    approvalsRequired
  }: TUpdateAccessApprovalPolicy) => Promise<{
    environment: {
      id: string;
      name: string;
      slug: string;
    };
    projectId: string;
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    approvals: number;
    envId: string;
    enforcementLevel: string;
    allowedSelfApprovals: boolean;
    secretPath: string;
    deletedAt?: Date | null | undefined;
  }>;
  getAccessApprovalPolicyByProjectSlug: ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectSlug
  }: TListAccessApprovalPoliciesDTO) => Promise<
    {
      approvers: (
        | {
            id: string | null | undefined;
            type: ApproverType;
            name: string;
            sequence: number | null | undefined;
            approvalsRequired: number | null | undefined;
          }
        | {
            id: string | null | undefined;
            type: ApproverType;
            sequence: number | null | undefined;
            approvalsRequired: number | null | undefined;
          }
      )[];
      name: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      approvals: number;
      envId: string;
      enforcementLevel: string;
      allowedSelfApprovals: boolean;
      secretPath: string;
      deletedAt?: Date | null | undefined;
      environment: {
        id: string;
        name: string;
        slug: string;
      };
      projectId: string;
      bypassers: (
        | {
            id: string | null | undefined;
            type: BypasserType;
            name: string;
          }
        | {
            id: string | null | undefined;
            type: BypasserType;
          }
      )[];
    }[]
  >;
  getAccessApprovalPolicyById: ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    policyId
  }: TGetAccessApprovalPolicyByIdDTO) => Promise<{
    approvers: (
      | {
          id: string | null | undefined;
          type: ApproverType.User;
          name: string;
          sequence: number | null | undefined;
          approvalsRequired: number | null | undefined;
        }
      | {
          id: string | null | undefined;
          type: ApproverType.Group;
          sequence: number | null | undefined;
          approvalsRequired: number | null | undefined;
        }
    )[];
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    approvals: number;
    envId: string;
    enforcementLevel: string;
    allowedSelfApprovals: boolean;
    secretPath: string;
    deletedAt?: Date | null | undefined;
    environment: {
      id: string;
      name: string;
      slug: string;
    };
    projectId: string;
    bypassers: (
      | {
          id: string | null | undefined;
          type: BypasserType.User;
          name: string;
        }
      | {
          id: string | null | undefined;
          type: BypasserType.Group;
        }
    )[];
  }>;
}

export const accessApprovalPolicyDALFactory = (db: TDbClient): TAccessApprovalPolicyDALFactory => {
  const accessApprovalPolicyOrm = ormify(db, TableName.AccessApprovalPolicy);

  const accessApprovalPolicyFindQuery = async (
    tx: Knex,
    filter: TFindFilter<TAccessApprovalPolicies & { projectId: string }>,
    customFilter?: {
      policyId?: string;
      envId?: string;
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
      .join(
        TableName.AccessApprovalPolicyEnvironment,
        `${TableName.AccessApprovalPolicy}.id`,
        `${TableName.AccessApprovalPolicyEnvironment}.policyId`
      )
      .join(TableName.Environment, `${TableName.AccessApprovalPolicyEnvironment}.envId`, `${TableName.Environment}.id`)
      .where((qb) => {
        if (customFilter?.envId) {
          void qb.where(`${TableName.AccessApprovalPolicyEnvironment}.envId`, "=", customFilter.envId);
        }
      })
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
      .select(tx.ref("bypasserUserId").withSchema(TableName.AccessApprovalPolicyBypasser))
      .select(tx.ref("bypasserGroupId").withSchema(TableName.AccessApprovalPolicyBypasser))
      .select(tx.ref("name").withSchema(TableName.Environment).as("envName"))
      .select(tx.ref("slug").withSchema(TableName.Environment).as("envSlug"))
      .select(tx.ref("id").withSchema(TableName.Environment).as("environmentId"))
      .select(tx.ref("projectId").withSchema(TableName.Environment))
      .select(selectAllTableCols(TableName.AccessApprovalPolicy));

    return result;
  };

  const findById: TAccessApprovalPolicyDALFactory["findById"] = async (policyId, tx) => {
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
          },
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
      if (!formattedDoc?.[0]) return;

      return {
        ...formattedDoc?.[0],
        approvers: formattedDoc?.[0]?.approvers.sort((a, b) => (a.sequence || 1) - (b.sequence || 1))
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindById" });
    }
  };

  const find: TAccessApprovalPolicyDALFactory["find"] = async (filter, customFilter, tx) => {
    try {
      const docs = await accessApprovalPolicyFindQuery(tx || db.replicaNode(), filter, customFilter);

      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (data) => ({
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
              type: ApproverType.User as const,
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
              type: ApproverType.Group as const,
              sequence: approverSequence,
              approvalsRequired
            })
          },
          {
            key: "bypasserUserId",
            label: "bypassers" as const,
            mapper: ({ bypasserUserId: id, bypasserUsername }) => ({
              id,
              type: BypasserType.User as const,
              name: bypasserUsername
            })
          },
          {
            key: "bypasserGroupId",
            label: "bypassers" as const,
            mapper: ({ bypasserGroupId: id }) => ({
              id,
              type: BypasserType.Group as const
            })
          },
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

      return formattedDocs.map((el) => ({
        ...el,
        approvers: el?.approvers.sort((a, b) => (a.sequence || 1) - (b.sequence || 1))
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find" });
    }
  };

  const softDeleteById: TAccessApprovalPolicyDALFactory["softDeleteById"] = async (policyId, tx) => {
    const softDeletedPolicy = await accessApprovalPolicyOrm.updateById(policyId, { deletedAt: new Date() }, tx);
    return softDeletedPolicy;
  };

  const findLastValidPolicy: TAccessApprovalPolicyDALFactory["findLastValidPolicy"] = async (
    { envId, secretPath },
    tx
  ) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.AccessApprovalPolicy)
        .where(
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          buildFindFilter(
            {
              secretPath
            },
            TableName.AccessApprovalPolicy
          )
        )
        .join(
          TableName.AccessApprovalPolicyEnvironment,
          `${TableName.AccessApprovalPolicyEnvironment}.policyId`,
          `${TableName.AccessApprovalPolicy}.id`
        )
        .where(`${TableName.AccessApprovalPolicyEnvironment}.envId`, "=", envId)
        .orderBy("deletedAt", "desc")
        .orderByRaw(`"deletedAt" IS NULL`)
        .select(selectAllTableCols(TableName.AccessApprovalPolicy))
        .first();

      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLastValidPolicy" });
    }
  };

  const findPolicyByEnvIdAndSecretPath: TAccessApprovalPolicyDALFactory["findPolicyByEnvIdAndSecretPath"] = async (
    { envIds, secretPath },
    tx
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.AccessApprovalPolicy)
        .join(
          TableName.AccessApprovalPolicyEnvironment,
          `${TableName.AccessApprovalPolicyEnvironment}.policyId`,
          `${TableName.AccessApprovalPolicy}.id`
        )
        .join(
          TableName.Environment,
          `${TableName.AccessApprovalPolicyEnvironment}.envId`,
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
            TableName.AccessApprovalPolicyEnvironment
          )
        )
        .where(
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          buildFindFilter(
            {
              secretPath
            },
            TableName.AccessApprovalPolicy
          )
        )
        .whereNull(`${TableName.AccessApprovalPolicy}.deletedAt`)
        .orderBy("deletedAt", "desc")
        .orderByRaw(`"deletedAt" IS NULL`)
        .select(selectAllTableCols(TableName.AccessApprovalPolicy))
        .select(db.ref("name").withSchema(TableName.Environment).as("envName"))
        .select(db.ref("slug").withSchema(TableName.Environment).as("envSlug"))
        .select(db.ref("id").withSchema(TableName.Environment).as("environmentId"))
        .select(db.ref("projectId").withSchema(TableName.Environment));
      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (data) => ({
          projectId: data.projectId,
          ...AccessApprovalPoliciesSchema.parse(data)
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

  return {
    ...accessApprovalPolicyOrm,
    find,
    findById,
    softDeleteById,
    findLastValidPolicy,
    findPolicyByEnvIdAndSecretPath
  };
};
