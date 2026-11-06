import { Knex } from "knex";
import picomatch from "picomatch";
import { z } from "zod";

import { TApprovalPolicies, TProjectEnvironments } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { containsGlobPatterns } from "@app/lib/picomatch";
import {
  TApprovalPolicyBypassersDALFactory,
  TApprovalPolicyDALFactory,
  TApprovalPolicySecretEnvironmentDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "@app/services/approval-policy/approval-policy-dal";
import { ActorType } from "@app/services/auth/auth-type";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { approvalPolicyMembershipVerifierFactory } from "../access-approval-policy/access-approval-policy-fns";
import { ApproverType, BypasserType } from "../access-approval-policy/access-approval-policy-types";
import { TSecretChangePolicyDALFactory, TSecretChangePolicyRow } from "./secret-change-policy-dal";
import {
  TCreateSapDTO,
  TSecretChangePolicy,
  TSecretChangePolicyEnvironment,
  TUpdateSapDTO
} from "./secret-change-policy-types";

type TSecretChangePolicyFnsFactoryDep = {
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findByIdForUpdate" | "updateById" | "transaction">;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "create" | "updateById">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "insertMany" | "delete">;
  approvalPolicyBypassersDAL: Pick<TApprovalPolicyBypassersDALFactory, "insertMany" | "delete">;
  approvalPolicySecretEnvironmentDAL: Pick<
    TApprovalPolicySecretEnvironmentDALFactory,
    "findSecretChangePolicyByEnvIdsAndSecretPath" | "insertMany" | "delete"
  >;
  secretChangePolicyDAL: Pick<TSecretChangePolicyDALFactory, "findSecretChangePolicies">;
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

export const getPolicyScore = (policy: { secretPath?: string | null }) =>
  // if glob pattern score is 1, if not exist score is 0 and if its not both then its exact path meaning score 2
  // eslint-disable-next-line
  policy.secretPath ? (containsGlobPatterns(policy.secretPath) ? 1 : 2) : 0;

// picks the highest-priority policy governing a secret path: exact path match first, then glob, then env-scoped.
export const resolvePolicyForPath = <T extends { secretPath?: string | null; createdAt: Date; id: string }>(
  policies: T[],
  secretPath: string
) =>
  policies
    .filter(
      ({ secretPath: policyPath }) => !policyPath || picomatch.isMatch(secretPath, policyPath, { strictSlashes: false })
    )
    .sort(
      (a, b) =>
        getPolicyScore(b) - getPolicyScore(a) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id)
    )
    .shift();

/**
 * Returns the committer ID fields for a secret approval request,
 * setting the appropriate field based on the actor type.
 */
export const getCommitterIds = (actor: ActorType, actorId: string) => ({
  committerUserId: actor === ActorType.USER ? actorId : undefined,
  committerIdentityId: actor === ActorType.IDENTITY ? actorId : undefined
});

/**
 * Determines whether a secret approval policy should be enforced for the current actor.
 *
 * Returns `false` (skip enforcement) when:
 *   1. No policy exists for the path/env (`policy` is `undefined`)
 *   2. The actor is a machine identity and the policy allows bypass
 *   3. The actor is neither a USER nor an IDENTITY (e.g. PLATFORM, SCIM_CLIENT)
 *
 * Acts as a TypeScript type guard: when it returns `true`, downstream code
 * can safely access `policy.id`, `policy.name`, etc.
 */
export const shouldApplyPolicy = <T extends { bypassForMachineIdentities: boolean }>(
  policy: T | undefined,
  actorType: ActorType
): policy is T => {
  if (!policy) return false;
  if (actorType === ActorType.IDENTITY && policy.bypassForMachineIdentities) return false;
  if (actorType !== ActorType.USER && actorType !== ActorType.IDENTITY) return false;
  return true;
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
  secretChangePolicyDAL,
  projectDAL,
  userDAL
}: TSecretChangePolicyFnsFactoryDep) => {
  const { verifyProjectSubjectsMembership } = approvalPolicyMembershipVerifierFactory({ projectDAL });

  const findSecretChangePolicyById = async (policyId: string, tx?: Knex) => {
    const [row] = await secretChangePolicyDAL.findSecretChangePolicies({ policyId }, tx);
    return row ? toSecretChangePolicy(row) : undefined;
  };

  const findSecretChangePoliciesByEnvId = async (envId: string, tx?: Knex) => {
    const rows = await secretChangePolicyDAL.findSecretChangePolicies({ envId }, tx);
    return rows.map(toSecretChangePolicy);
  };

  const findSecretChangePoliciesByProjectId = async (projectId: string) => {
    const rows = await secretChangePolicyDAL.findSecretChangePolicies({ projectId });
    return rows.map(toSecretChangePolicy);
  };

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
    const existingPolicy = await approvalPolicySecretEnvironmentDAL.findSecretChangePolicyByEnvIdsAndSecretPath(
      { envIds, secretPath, excludePolicyId },
      tx
    );
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
    const [row] = await secretChangePolicyDAL.findSecretChangePolicies({ policyId }, tx);
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

      const [row] = await secretChangePolicyDAL.findSecretChangePolicies({ policyId: policy.id }, tx);
      return toSecretChangePolicy(row);
    });

  return {
    findSecretChangePolicyById,
    findSecretChangePoliciesByEnvId,
    findSecretChangePoliciesByProjectId,
    assertNoPolicyForSecretPath,
    resolveBypassers,
    resolveApproverUserIds,
    verifyPolicyActorsMembership,
    updatePolicy
  };
};
