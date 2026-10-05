import { Knex } from "knex";
import { z } from "zod";

import { TApprovalPolicies, TProjectEnvironments } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import {
  TApprovalPolicyBypassersDALFactory,
  TApprovalPolicyDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "@app/services/approval-policy/approval-policy-dal";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { approvalPolicyMembershipVerifierFactory } from "../access-approval-policy/access-approval-policy-fns";
import { ApproverType, BypasserType } from "../access-approval-policy/access-approval-policy-types";
import { TSecretApprovalPolicyDALFactory } from "../secret-approval-policy/secret-approval-policy-dal";
import { TCreateSapDTO, TUpdateSapDTO } from "../secret-approval-policy/secret-approval-policy-types";
import { TSecretChangePolicyBridgeDALFactory, TSecretChangePolicyRow } from "./secret-change-policy-bridge-dal";
import { TSecretChangePolicy, TSecretChangePolicyEnvironment } from "./secret-change-policy-bridge-types";
import { TApprovalPolicySecretEnvironmentDALFactory } from "./secret-change-policy-environment-dal";

type TSecretChangePolicyFnsFactoryDep = {
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findOne" | "findByIdForUpdate" | "updateById" | "transaction">;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "create" | "updateById">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "insertMany" | "delete">;
  approvalPolicyBypassersDAL: Pick<TApprovalPolicyBypassersDALFactory, "insertMany" | "delete">;
  approvalPolicySecretEnvironmentDAL: Pick<
    TApprovalPolicySecretEnvironmentDALFactory,
    "findPolicyByEnvIdAndSecretPath" | "insertMany" | "delete"
  >;
  secretChangePolicyBridgeDAL: Pick<TSecretChangePolicyBridgeDALFactory, "findSecretChangePolicies">;
  secretApprovalPolicyDAL: Pick<TSecretApprovalPolicyDALFactory, "findPolicyByEnvIdAndSecretPath">;
  projectDAL: Pick<TProjectDALFactory, "findEffectiveProjectSubjectsMembership">;
  userDAL: Pick<TUserDALFactory, "find">;
};

type TUpdatePolicyInput = Pick<
  TUpdateSapDTO,
  "name" | "approvals" | "secretPath" | "enforcementLevel" | "allowedSelfApprovals" | "bypassForMachineIdentities"
> & {
  policy: Pick<TApprovalPolicies, "id">;
  requestedEnvs?: TSecretChangePolicyEnvironment[];
  approverCount: number;
  userApproverIds: string[];
  groupApprovers: string[];
  bypasserUserIds: string[];
  groupBypassers: string[];
};

const SecretChangePolicyConstraintsSchema = z
  .object({
    constraints: z.object({ allowedSelfApprovals: z.boolean().optional() }).passthrough().optional()
  })
  .passthrough();

export const readSecretChangePolicyConstraints = (constraints: unknown): { allowedSelfApprovals?: boolean } => {
  const parsed = SecretChangePolicyConstraintsSchema.safeParse(constraints);
  return parsed.success ? (parsed.data.constraints ?? {}) : {};
};

// The global approval system stores what the legacy policy row carried inline: the path per environment row,
// the approval count on the first step and self-approval in the constraints blob.
export const toSecretChangePolicy = (row: TSecretChangePolicyRow): TSecretChangePolicy => {
  const [firstStep] = row.steps;
  const [environment] = row.environments;
  return {
    id: row.id,
    name: row.name,
    projectId: row.projectId,
    enforcementLevel: row.enforcementLevel,
    bypassForMachineIdentities: row.bypassForMachineIdentities ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: null,
    secretPath: row.secretPath,
    approvals: firstStep?.requiredApprovals ?? 1,
    allowedSelfApprovals: readSecretChangePolicyConstraints(row.constraints).allowedSelfApprovals ?? true,
    envId: environment.id,
    environment,
    environments: row.environments,
    approvers: row.approvers,
    bypassers: row.bypassers,
    userApprovers: row.userApprovers
  };
};

export const splitApprovers = (approvers: TCreateSapDTO["approvers"]) => ({
  groupApprovers: approvers
    .filter((approver) => approver.type === ApproverType.Group)
    .map((approver) => approver.id)
    .filter(Boolean) as string[],
  userApprovers: approvers
    .filter((approver) => approver.type === ApproverType.User)
    .map((approver) => approver.id)
    .filter(Boolean) as string[],
  userApproverNames: approvers
    .map((approver) => (approver.type === ApproverType.User ? approver.username : undefined))
    .filter(Boolean) as string[]
});

export const secretChangePolicyFnsFactory = ({
  approvalPolicyDAL,
  approvalPolicyStepsDAL,
  approvalPolicyStepApproversDAL,
  approvalPolicyBypassersDAL,
  approvalPolicySecretEnvironmentDAL,
  secretChangePolicyBridgeDAL,
  secretApprovalPolicyDAL,
  projectDAL,
  userDAL
}: TSecretChangePolicyFnsFactoryDep) => {
  const { verifyProjectSubjectsMembership } = approvalPolicyMembershipVerifierFactory({ projectDAL });

  const findSecretChangePolicy = (policyId: string, tx?: Knex) =>
    approvalPolicyDAL.findOne({ id: policyId, type: ApprovalPolicyType.SecretChange }, tx);

  const findSecretChangePolicyBySecretPath = (
    { envIds, secretPath }: { envIds: string[]; secretPath: string },
    tx?: Knex
  ) => approvalPolicySecretEnvironmentDAL.findPolicyByEnvIdAndSecretPath({ envIds, secretPath }, tx);

  const findSecretChangePoliciesByEnvId = async (envId: string, tx?: Knex) => {
    const rows = await secretChangePolicyBridgeDAL.findSecretChangePolicies({ envId }, tx);
    return rows.map(toSecretChangePolicy);
  };

  const findSecretChangePoliciesByProjectId = async (projectId: string) => {
    const rows = await secretChangePolicyBridgeDAL.findSecretChangePolicies({ projectId });
    return rows.map(toSecretChangePolicy);
  };

  // Policies are being migrated onto the global approval system, so a path is taken whether the policy that
  // governs it still lives on the legacy secret approval tables or already lives on the new ones.
  const assertNoPolicyForSecretPath = async (
    {
      envs,
      secretPath,
      excludePolicyId
    }: {
      envs: Pick<TProjectEnvironments, "id" | "slug">[];
      secretPath: string;
      excludePolicyId?: string;
    },
    tx?: Knex
  ) => {
    const envIds = envs.map((env) => env.id);
    const secretChangePolicy = await approvalPolicySecretEnvironmentDAL.findPolicyByEnvIdAndSecretPath(
      { envIds, secretPath, excludePolicyId },
      tx
    );
    const legacyPolicy = await secretApprovalPolicyDAL.findPolicyByEnvIdAndSecretPath({ envIds, secretPath }, tx);
    const existingPolicy = secretChangePolicy || legacyPolicy;
    if (!existingPolicy) return;

    const governedEnvIds = new Set(existingPolicy.environments.map((env) => env.id));
    const env = envs.find((el) => governedEnvIds.has(el.id)) ?? envs[0];
    throw new BadRequestError({
      message: `A policy for secret path '${secretPath}' already exists in environment '${env.slug}'`
    });
  };

  const resolveBypassers = async (bypassers: TCreateSapDTO["bypassers"]) => {
    let groupBypassers: string[] = [];
    let bypasserUserIds: string[] = [];

    if (bypassers && bypassers.length) {
      groupBypassers = bypassers
        .filter((bypasser) => bypasser.type === BypasserType.Group)
        .map((bypasser) => bypasser.id) as string[];

      const userBypassers = bypassers
        .filter((bypasser) => bypasser.type === BypasserType.User)
        .map((bypasser) => bypasser.id)
        .filter(Boolean) as string[];

      const userBypasserNames = bypassers
        .map((bypasser) => (bypasser.type === BypasserType.User ? bypasser.username : undefined))
        .filter(Boolean) as string[];

      bypasserUserIds = userBypassers;
      if (userBypasserNames.length) {
        const bypasserUsers = await userDAL.find({
          $in: {
            username: userBypasserNames
          }
        });

        const bypasserNamesFromDb = bypasserUsers.map((user) => user.username);
        const invalidUsernames = userBypasserNames.filter((username) => !bypasserNamesFromDb.includes(username));

        if (invalidUsernames.length) {
          throw new BadRequestError({
            message: `Invalid bypasser user: ${invalidUsernames.join(", ")}`
          });
        }

        bypasserUserIds = bypasserUserIds.concat(bypasserUsers.map((user) => user.id));
      }
    }

    return { bypasserUserIds, groupBypassers };
  };

  const resolveApproverUserIds = async ({
    userApprovers,
    userApproverNames
  }: {
    userApprovers: string[];
    userApproverNames: string[];
  }) => {
    if (!userApproverNames.length) return userApprovers;

    const approverUsers = await userDAL.find({
      $in: {
        username: userApproverNames
      }
    });

    const approverNamesFromDb = approverUsers.map((user) => user.username);
    const invalidUsernames = userApproverNames.filter((username) => !approverNamesFromDb.includes(username));

    if (invalidUsernames.length) {
      throw new BadRequestError({
        message: `Invalid approver user: ${invalidUsernames.join(", ")}`
      });
    }

    return userApprovers.concat(approverUsers.map((user) => user.id));
  };

  const verifyPolicyActorsMembership = async ({
    userApproverIds,
    groupApprovers,
    bypasserUserIds,
    groupBypassers,
    orgId,
    projectId
  }: {
    userApproverIds: string[];
    groupApprovers: string[];
    bypasserUserIds: string[];
    groupBypassers: string[];
    orgId: string;
    projectId: string;
  }) => {
    await verifyProjectSubjectsMembership({
      userIds: userApproverIds,
      groupIds: groupApprovers,
      orgId,
      projectId
    });

    if (bypasserUserIds.length) {
      await verifyProjectSubjectsMembership({
        userIds: bypasserUserIds,
        groupIds: [],
        orgId,
        projectId
      });
    }

    if (groupBypassers.length) {
      await verifyProjectSubjectsMembership({
        userIds: [],
        groupIds: groupBypassers,
        orgId,
        projectId
      });
    }
  };

  const getSecretChangePolicyState = async (policyId: string, tx: Knex) => {
    const [row] = await secretChangePolicyBridgeDAL.findSecretChangePolicies({ policyId }, tx);
    if (!row) {
      throw new NotFoundError({
        message: `Secret approval policy with ID '${policyId}' no longer governs any environment`
      });
    }

    const policy = toSecretChangePolicy(row);
    return {
      step: row.steps[0],
      envs: row.environments,
      secretPath: policy.secretPath,
      approvals: policy.approvals
    };
  };

  const updatePolicy = ({
    policy,
    name,
    approvals,
    secretPath,
    enforcementLevel,
    allowedSelfApprovals,
    bypassForMachineIdentities,
    requestedEnvs,
    approverCount,
    userApproverIds,
    groupApprovers,
    bypasserUserIds,
    groupBypassers
  }: TUpdatePolicyInput) =>
    approvalPolicyDAL.transaction(async (tx) => {
      // Lock the policy row so concurrent updates serialize; the collision check and the
      // delete-then-insert rewrites below are only safe against the state read under that lock.
      const lockedPolicy = await approvalPolicyDAL.findByIdForUpdate(policy.id, tx);
      if (!lockedPolicy) {
        throw new NotFoundError({ message: `Secret approval policy with ID '${policy.id}' not found` });
      }
      const current = await getSecretChangePolicyState(policy.id, tx);

      const nextApprovals = approvals ?? current.approvals;
      if (!groupApprovers.length && nextApprovals > approverCount)
        throw new BadRequestError({ message: "Approvals cannot be greater than approvers" });

      const envs = requestedEnvs ?? current.envs;
      const nextSecretPath = secretPath ?? current.secretPath;
      await assertNoPolicyForSecretPath({ envs, secretPath: nextSecretPath, excludePolicyId: policy.id }, tx);

      const updateDoc: Parameters<typeof approvalPolicyDAL.updateById>[1] = {};
      if (name !== undefined) updateDoc.name = name;
      if (enforcementLevel !== undefined) updateDoc.enforcementLevel = enforcementLevel;
      if (bypassForMachineIdentities !== undefined) updateDoc.bypassForMachineIdentities = bypassForMachineIdentities;
      if (allowedSelfApprovals !== undefined) {
        updateDoc.constraints = {
          version: 1,
          constraints: { ...readSecretChangePolicyConstraints(lockedPolicy.constraints), allowedSelfApprovals }
        };
      }
      if (Object.keys(updateDoc).length) await approvalPolicyDAL.updateById(policy.id, updateDoc, tx);

      let { step } = current;
      if (!step) {
        step = await approvalPolicyStepsDAL.create(
          { policyId: policy.id, stepNumber: 1, requiredApprovals: nextApprovals },
          tx
        );
      } else if (approvals !== undefined) {
        step = await approvalPolicyStepsDAL.updateById(step.id, { requiredApprovals: approvals }, tx);
      }

      await approvalPolicyStepApproversDAL.delete({ policyStepId: step.id }, tx);
      await approvalPolicyStepApproversDAL.insertMany(
        [
          ...userApproverIds.map((userId) => ({ policyStepId: step.id, userId, groupId: null })),
          ...groupApprovers.map((groupId) => ({ policyStepId: step.id, userId: null, groupId }))
        ],
        tx
      );

      if (requestedEnvs || secretPath !== undefined) {
        await approvalPolicySecretEnvironmentDAL.delete({ policyId: policy.id }, tx);
        await approvalPolicySecretEnvironmentDAL.insertMany(
          envs.map((env) => ({ policyId: policy.id, envId: env.id, secretPath: nextSecretPath })),
          tx
        );
      }

      await approvalPolicyBypassersDAL.delete({ policyId: policy.id }, tx);
      await approvalPolicyBypassersDAL.insertMany(
        [
          ...bypasserUserIds.map((userId) => ({ policyId: policy.id, userId, groupId: null })),
          ...groupBypassers.map((groupId) => ({ policyId: policy.id, userId: null, groupId }))
        ],
        tx
      );

      const [row] = await secretChangePolicyBridgeDAL.findSecretChangePolicies({ policyId: policy.id }, tx);
      return toSecretChangePolicy(row);
    });

  return {
    findSecretChangePolicy,
    findSecretChangePolicyBySecretPath,
    findSecretChangePoliciesByEnvId,
    findSecretChangePoliciesByProjectId,
    assertNoPolicyForSecretPath,
    resolveBypassers,
    resolveApproverUserIds,
    verifyPolicyActorsMembership,
    updatePolicy
  };
};
