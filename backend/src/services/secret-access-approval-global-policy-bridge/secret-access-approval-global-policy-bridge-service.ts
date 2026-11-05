import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { ActionProjectType } from "@app/db/schemas";
import { approvalPolicyMembershipVerifierFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-fns";
import {
  ApproverType,
  BypasserType,
  TCreateAccessApprovalPolicy
} from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, ConflictError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ApprovalPolicyType, ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { insertApprovalRequestSteps } from "@app/services/approval-policy/approval-request-fns";
import { ActorType } from "@app/services/auth/auth-type";
import { assertDelegatedApprovalPolicyConstraints } from "@app/services/delegated-approval/delegated-approval-fns";
import { TDelegatedApprovalPolicyInput } from "@app/services/delegated-approval/delegated-approval-types";

import {
  buildSecretAccessPolicySteps,
  revokeActiveSecretAccessGrants,
  secretAccessApprovalGlobalPolicyExists
} from "./secret-access-approval-global-policy-bridge-fns";
import {
  TCountSecretAccessApprovalGlobalPoliciesDTO,
  TCreateSecretAccessApprovalGlobalPolicyDTO,
  TDeleteSecretAccessApprovalGlobalPolicyDTO,
  TGetSecretAccessApprovalGlobalPolicyByIdDTO,
  TListSecretAccessApprovalGlobalPoliciesDTO,
  TSecretAccessApprovalGlobalPolicyBridgeServiceFactoryDep,
  TUpdateSecretAccessApprovalGlobalPolicyDTO
} from "./secret-access-approval-global-policy-bridge-types";

export type TSecretAccessApprovalGlobalPolicyBridgeServiceFactory = ReturnType<
  typeof secretAccessApprovalGlobalPolicyBridgeServiceFactory
>;

type TApproverInput = TCreateAccessApprovalPolicy["approvers"];
type TBypasserInput = NonNullable<TCreateAccessApprovalPolicy["bypassers"]>;
type TSequencedSubject = { id: string; sequence?: number };
type TPolicyStep = {
  requiredApprovals: number;
  approvers: { type: ApproverType; id: string }[];
};
type TPolicyReviewers = { steps: TPolicyStep[]; bypasserUserIds: string[]; groupBypassers: string[] };

// defined for delegated approvals
const NO_REVIEWERS: TPolicyReviewers = { steps: [], bypasserUserIds: [], groupBypassers: [] };

const isDelegatedApprovalChanged = (
  existing: TDelegatedApprovalPolicyInput | null,
  incoming: TDelegatedApprovalPolicyInput
) => existing?.type !== incoming.type || existing?.connectionId !== incoming.connectionId;

export const secretAccessApprovalGlobalPolicyBridgeServiceFactory = ({
  projectDAL,
  permissionService,
  projectEnvDAL,
  userDAL,
  groupDAL,
  accessApprovalPolicyDAL,
  approvalPolicyDAL,
  approvalPolicyStepsDAL,
  approvalPolicyStepApproversDAL,
  approvalPolicyBypassersDAL,
  approvalPolicySecretEnvironmentDAL,
  secretAccessApprovalGlobalPolicyBridgeDAL,
  approvalRequestDAL,
  approvalRequestStepsDAL,
  approvalRequestStepEligibleApproversDAL,
  approvalRequestGrantsDAL,
  additionalPrivilegeDAL,
  delegatedApprovalService
}: TSecretAccessApprovalGlobalPolicyBridgeServiceFactoryDep) => {
  const { verifyProjectSubjectsMembership } = approvalPolicyMembershipVerifierFactory({ projectDAL });

  const $splitApprovers = (approvers: TApproverInput) => ({
    groupApprovers: approvers.filter((approver) => approver.type === ApproverType.Group) as TSequencedSubject[],
    userApprovers: approvers.filter(
      (approver) => approver.type === ApproverType.User && approver.id
    ) as TSequencedSubject[],
    userApproverNames: approvers.filter((approver) => approver.type === ApproverType.User && approver.username) as {
      username: string;
      sequence?: number;
    }[]
  });

  const $resolveApprovers = async (
    approvers: TApproverInput,
    { projectId, orgId }: { projectId: string; orgId: string },
    tx?: Knex
  ) => {
    const { groupApprovers, userApprovers, userApproverNames } = $splitApprovers(approvers);

    let approverUserIds = userApprovers;
    if (userApproverNames.length) {
      const approverUsersInDB = await userDAL.find(
        {
          $in: {
            username: userApproverNames.map((el) => el.username)
          }
        },
        { tx }
      );
      const approverUsersInDBGroupByUsername = groupBy(approverUsersInDB, (i) => i.username);
      const invalidUsernames = userApproverNames.filter((el) => !approverUsersInDBGroupByUsername?.[el.username]?.[0]);

      if (invalidUsernames.length) {
        throw new BadRequestError({
          message: `Invalid approver user: ${invalidUsernames.map((i) => i.username).join(", ")}`
        });
      }

      approverUserIds = approverUserIds.concat(
        userApproverNames.map((el) => ({
          id: approverUsersInDBGroupByUsername[el.username]?.[0].id,
          sequence: el.sequence
        }))
      );
    }

    if (approverUserIds.length > 0 || groupApprovers.length > 0) {
      await verifyProjectSubjectsMembership({
        userIds: approverUserIds.map((au) => au.id),
        groupIds: groupApprovers.map((ga) => ga.id).filter(Boolean),
        orgId,
        projectId,
        tx
      });
    }

    return { approverUserIds, groupApprovers };
  };

  const $resolveBypassers = async (
    bypassers: TBypasserInput | undefined,
    { projectId, orgId }: { projectId: string; orgId: string },
    tx?: Knex
  ) => {
    let groupBypassers: string[] = [];
    let bypasserUserIds: string[] = [];

    if (bypassers && bypassers.length) {
      groupBypassers = [
        ...new Set(
          bypassers
            .filter((bypasser) => bypasser.type === BypasserType.Group)
            .map((bypasser) => bypasser.id) as string[]
        )
      ];

      const userBypassers = bypassers
        .filter((bypasser) => bypasser.type === BypasserType.User)
        .map((bypasser) => bypasser.id)
        .filter(Boolean) as string[];

      const userBypasserNames = bypassers
        .map((bypasser) => (bypasser.type === BypasserType.User ? bypasser.username : undefined))
        .filter(Boolean) as string[];

      bypasserUserIds = userBypassers;
      if (userBypasserNames.length) {
        const bypasserUsers = await userDAL.find(
          {
            $in: {
              username: userBypasserNames
            }
          },
          { tx }
        );

        const bypasserNamesFromDb = bypasserUsers.map((user) => user.username);
        const invalidUsernames = userBypasserNames.filter((username) => !bypasserNamesFromDb.includes(username));

        if (invalidUsernames.length) {
          throw new BadRequestError({
            message: `Invalid bypasser user: ${invalidUsernames.join(", ")}`
          });
        }

        bypasserUserIds = bypasserUserIds.concat(bypasserUsers.map((user) => user.id));
      }
      bypasserUserIds = [...new Set(bypasserUserIds)];

      if (groupBypassers.length > 0) {
        const orgGroups = await groupDAL.find(
          {
            $in: { id: groupBypassers },
            orgId
          },
          { tx }
        );

        if (orgGroups.length !== groupBypassers.length) {
          const foundGroupIdsInOrg = new Set(orgGroups.map((group) => group.id));
          const missingGroupIds = groupBypassers.filter((id) => !foundGroupIdsInOrg.has(id));
          throw new BadRequestError({
            message: `One or more specified bypasser groups are not part of the organization or do not exist. Invalid or non-member group IDs: ${missingGroupIds.join(", ")}`
          });
        }
      }

      if (bypasserUserIds.length) {
        await verifyProjectSubjectsMembership({
          userIds: bypasserUserIds,
          groupIds: [],
          orgId,
          projectId,
          tx
        });
      }
    }

    return { bypasserUserIds, groupBypassers };
  };

  const $buildSteps = ({
    approverUserIds,
    groupApprovers,
    approvalsRequired,
    approvals
  }: {
    approverUserIds: TSequencedSubject[];
    groupApprovers: TSequencedSubject[];
    approvalsRequired?: { numberOfApprovals: number; stepNumber: number }[];
    approvals?: number;
  }): TPolicyStep[] =>
    buildSecretAccessPolicySteps(
      [
        ...approverUserIds.map((el) => ({ type: ApproverType.User, id: el.id, sequence: el.sequence ?? 1 })),
        ...groupApprovers.map((el) => ({ type: ApproverType.Group, id: el.id, sequence: el.sequence ?? 1 }))
      ],
      approvalsRequired,
      approvals
    );

  const $insertStepsAndBypassers = async (
    {
      policyId,
      steps,
      bypasserUserIds,
      groupBypassers
    }: { policyId: string; steps: TPolicyStep[]; bypasserUserIds: string[]; groupBypassers: string[] },
    tx: Knex
  ) => {
    const stepDocs = await approvalPolicyStepsDAL.insertMany(
      steps.map((step, i) => ({
        policyId,
        stepNumber: i + 1,
        requiredApprovals: step.requiredApprovals
      })),
      tx
    );

    await approvalPolicyStepApproversDAL.insertMany(
      steps.flatMap((step, i) =>
        step.approvers.map((approver) => ({
          policyStepId: stepDocs[i].id,
          userId: approver.type === ApproverType.User ? approver.id : null,
          groupId: approver.type === ApproverType.Group ? approver.id : null
        }))
      ),
      tx
    );

    if (bypasserUserIds.length || groupBypassers.length) {
      await approvalPolicyBypassersDAL.insertMany(
        [
          ...bypasserUserIds.map((userId) => ({ policyId, userId, groupId: null })),
          ...groupBypassers.map((groupId) => ({ policyId, userId: null, groupId }))
        ],
        tx
      );
    }
  };

  // A delegated policy hands review off entirely, so it carries no approver steps or bypassers of its own.
  const $resolveReviewers = async (
    {
      delegatedApproval,
      enforcementLevel,
      allowedSelfApprovals,
      approvers,
      bypassers,
      approvalsRequired,
      approvals
    }: {
      delegatedApproval: TDelegatedApprovalPolicyInput | null;
      enforcementLevel: string;
      allowedSelfApprovals: boolean;
      approvers: TApproverInput;
      bypassers: TBypasserInput | undefined;
      approvalsRequired?: { numberOfApprovals: number; stepNumber: number }[];
      approvals?: number;
    },
    scope: { projectId: string; orgId: string },
    tx?: Knex
  ): Promise<TPolicyReviewers> => {
    if (delegatedApproval) {
      assertDelegatedApprovalPolicyConstraints({ enforcementLevel, approvers, bypassers, allowedSelfApprovals });
      return NO_REVIEWERS;
    }

    if (!approvers.length) throw new BadRequestError({ message: "At least one approver should be provided" });
    const { approverUserIds, groupApprovers } = await $resolveApprovers(approvers, scope, tx);
    const { bypasserUserIds, groupBypassers } = await $resolveBypassers(bypassers, scope, tx);
    const steps = $buildSteps({ approverUserIds, groupApprovers, approvalsRequired, approvals });
    return { steps, bypasserUserIds, groupBypassers };
  };

  const $assertNoPendingRequests = async (policy: { id: string; name: string }, tx: Knex) => {
    const pendingRequests = await approvalRequestDAL.findPendingByPolicyIdForUpdate(policy.id, tx);
    if (!pendingRequests.length) return;
    throw new ConflictError({
      message: `Policy '${policy.name}' is handled by a delegated approval system and has ${pendingRequests.length} pending request(s). Resolve or cancel them before updating the policy.`
    });
  };

  const $getProjectPermission = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId
  }: Pick<TUpdateSecretAccessApprovalGlobalPolicyDTO, "actor" | "actorId" | "actorAuthMethod" | "actorOrgId"> & {
    projectId: string;
  }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    return permission;
  };

  const $resetPendingRequestSteps = async (
    { policyId, steps }: { policyId: string; steps: TPolicyStep[] },
    tx: Knex
  ) => {
    const pendingRequests = await approvalRequestDAL.findPendingByPolicyIdForUpdate(policyId, tx);
    if (!pendingRequests.length) return;

    const requestIds = pendingRequests.map((request) => request.id);
    await approvalRequestStepsDAL.delete({ $in: { requestId: requestIds } }, tx);
    await Promise.all(
      requestIds.map((requestId) =>
        insertApprovalRequestSteps(
          { requestId, policySteps: steps },
          { approvalRequestStepsDAL, approvalRequestStepEligibleApproversDAL },
          tx
        )
      )
    );
    await approvalRequestDAL.update({ $in: { id: requestIds } }, { currentStep: 1 }, tx);
  };

  const $findPolicyById = async (policyId: string, organizationId: string, message: string, tx?: Knex) => {
    const [policy] = await secretAccessApprovalGlobalPolicyBridgeDAL.findSecretAccessPolicies(
      {
        policyId,
        organizationId
      },
      tx
    );
    if (!policy) throw new NotFoundError({ message });
    return policy;
  };

  const $assertNoConflictingPolicy = async (
    {
      envs,
      secretPath,
      excludePolicyId
    }: { envs: { id: string; slug: string }[]; secretPath: string; excludePolicyId?: string },
    tx?: Knex
  ) => {
    if (!envs.length) return;

    const conflictingEnvId = await secretAccessApprovalGlobalPolicyExists(
      { envIds: envs.map((env) => env.id), secretPath, excludePolicyId },
      { accessApprovalPolicyDAL, approvalPolicySecretEnvironmentDAL },
      tx
    );
    if (!conflictingEnvId) return;

    const env = envs.find((candidate) => candidate.id === conflictingEnvId);
    throw new BadRequestError({
      message: env
        ? `A policy for secret path '${secretPath}' already exists in environment '${env.slug}'`
        : `A policy for secret path '${secretPath}' already exists`
    });
  };

  const $replacePolicyScope = async (
    {
      policyId,
      envs,
      secretPath,
      steps
    }: { policyId: string; envs: { id: string; slug: string }[]; secretPath: string; steps: TPolicyStep[] },
    tx: Knex
  ) => {
    await approvalPolicySecretEnvironmentDAL.findByPolicyIdForUpdate(policyId, tx);
    await $assertNoConflictingPolicy({ envs, secretPath, excludePolicyId: policyId }, tx);
    await approvalPolicySecretEnvironmentDAL.delete({ policyId }, tx);
    await approvalPolicySecretEnvironmentDAL.insertMany(
      envs.map((env) => ({ policyId, envId: env.id, secretPath })),
      tx
    );
    await $resetPendingRequestSteps({ policyId, steps }, tx);
  };

  const $applyDelegatedApprovalChange = async (
    {
      policyId,
      existing,
      incoming
    }: {
      policyId: string;
      existing: TDelegatedApprovalPolicyInput | null;
      incoming: TDelegatedApprovalPolicyInput | null | undefined;
    },
    tx: Knex
  ) => {
    if (incoming === undefined) return;
    if (incoming === null) {
      if (existing) await delegatedApprovalService.deletePolicyByPolicyId(policyId, tx);
      return;
    }
    if (!existing) {
      await delegatedApprovalService.createPolicy({ policyId, ...incoming }, tx);
      return;
    }
    if (isDelegatedApprovalChanged(existing, incoming)) {
      await delegatedApprovalService.updatePolicy({ policyId, ...incoming }, tx);
    }
  };

  const createAccessApprovalPolicy = async ({
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
    environments,
    enforcementLevel,
    allowedSelfApprovals: allowedSelfApprovalsInput,
    approvalsRequired,
    maxTimePeriod,
    requestExpirationTime,
    delegatedApproval,
    orgActor
  }: TCreateSecretAccessApprovalGlobalPolicyDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const permission = await $getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: project.id
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretApproval
    );

    const allowedSelfApprovals = allowedSelfApprovalsInput ?? !delegatedApproval;

    const mergedEnvs = (environment ? [environment] : environments) || [];
    if (mergedEnvs.length === 0) {
      throw new BadRequestError({ message: "Must provide either environment or environments" });
    }
    const envs = await projectEnvDAL.find({ $in: { slug: mergedEnvs }, projectId: project.id });
    if (!envs.length || envs.length !== mergedEnvs.length) {
      const notFoundEnvs = mergedEnvs.filter((env) => !envs.find((el) => el.slug === env));
      throw new NotFoundError({ message: `One or more environments not found: ${notFoundEnvs.join(", ")}` });
    }

    const reviewers = await $resolveReviewers(
      {
        delegatedApproval: delegatedApproval ?? null,
        enforcementLevel,
        allowedSelfApprovals,
        approvers,
        bypassers,
        approvalsRequired,
        approvals
      },
      { projectId: project.id, orgId: project.orgId }
    );
    if (delegatedApproval) {
      await delegatedApprovalService.validateConnection({ ...delegatedApproval, projectId: project.id }, orgActor);
    }

    await $assertNoConflictingPolicy({ envs, secretPath });

    const policy = await approvalPolicyDAL.transaction(async (tx) => {
      const doc = await approvalPolicyDAL.create(
        {
          projectId: project.id,
          organizationId: project.orgId,
          type: ApprovalPolicyType.SecretAccess,
          name,
          enforcementLevel,
          bypassForMachineIdentities: false,
          scopeType: null,
          scopeId: null,
          conditions: { version: 1, conditions: {} },
          constraints: {
            version: 1,
            constraints: {
              allowedSelfApprovals,
              requestExpirationTime: requestExpirationTime ?? null,
              maxTimePeriod: maxTimePeriod ?? null
            }
          }
        },
        tx
      );

      await approvalPolicySecretEnvironmentDAL.insertMany(
        envs.map((env) => ({ policyId: doc.id, envId: env.id, secretPath })),
        tx
      );

      if (delegatedApproval) {
        await delegatedApprovalService.createPolicy({ policyId: doc.id, ...delegatedApproval }, tx);
      } else {
        await $insertStepsAndBypassers({ policyId: doc.id, ...reviewers }, tx);
      }

      return doc;
    });

    return {
      id: policy.id,
      name: policy.name,
      secretPath,
      approvals: reviewers.steps[0]?.requiredApprovals ?? 1,
      envId: envs[0].id,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
      enforcementLevel: policy.enforcementLevel,
      deletedAt: null,
      allowedSelfApprovals,
      bypassForMachineIdentities: false,
      maxTimePeriod: maxTimePeriod ?? null,
      requestExpirationTime: requestExpirationTime ?? null,
      environment: envs[0],
      environments: envs,
      projectId: project.id,
      delegatedApproval: delegatedApproval ?? null
    };
  };

  const updateAccessApprovalPolicy = async ({
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
    allowedSelfApprovals: allowedSelfApprovalsInput,
    approvalsRequired,
    environments,
    maxTimePeriod,
    requestExpirationTime,
    delegatedApproval,
    orgActor
  }: TUpdateSecretAccessApprovalGlobalPolicyDTO) => {
    const policy = await $findPolicyById(
      policyId,
      actorOrgId,
      `Access approval policy with ID '${policyId}' not found`
    );

    const permission = await $getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: policy.projectId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretApproval);

    let envs: { id: string; slug: string }[] = policy.environments;
    if (environments) {
      envs = await projectEnvDAL.find({ $in: { slug: environments }, projectId: policy.projectId });
      if (envs.length !== environments.length) {
        const notFoundEnvs = environments.filter((env) => !envs.find((el) => el.slug === env));
        throw new NotFoundError({ message: `One or more environments not found: ${notFoundEnvs.join(", ")}` });
      }
    }

    const nextSecretPath = secretPath || policy.secretPath;
    const currentEnvSlugs = new Set(policy.environments.map((env) => env.slug));
    const environmentsChanged =
      environments !== undefined &&
      (envs.length !== currentEnvSlugs.size || envs.some((env) => !currentEnvSlugs.has(env.slug)));
    const scopeChanged = nextSecretPath !== policy.secretPath || environmentsChanged;

    const nextDelegatedApproval = delegatedApproval === undefined ? policy.delegatedApproval : delegatedApproval;
    if (nextDelegatedApproval) {
      // we might need to change this in the future to check a specific permission if this is changed on the license server
      await delegatedApprovalService.assertPlanAllowsPolicyEdit(nextDelegatedApproval.type, actorOrgId);
      if (isDelegatedApprovalChanged(policy.delegatedApproval, nextDelegatedApproval)) {
        await delegatedApprovalService.validateConnection(
          { ...nextDelegatedApproval, projectId: policy.projectId },
          orgActor
        );
      }
    }

    return approvalPolicyDAL.transaction(async (tx) => {
      const lockedPolicy = await approvalPolicyDAL.findByIdForUpdate(policy.id, tx);
      if (!lockedPolicy) {
        throw new NotFoundError({ message: `Access approval policy with ID '${policyId}' not found` });
      }

      const current = await $findPolicyById(
        policy.id,
        actorOrgId,
        `Access approval policy with ID '${policyId}' not found`,
        tx
      );
      const existingDelegatedApproval = current.delegatedApproval;
      const delegatedApprovalAfterUpdate =
        delegatedApproval === undefined ? existingDelegatedApproval : delegatedApproval;
      const involvesDelegatedApproval = Boolean(existingDelegatedApproval || delegatedApprovalAfterUpdate);
      const allowedSelfApprovals = allowedSelfApprovalsInput ?? !delegatedApprovalAfterUpdate;
      const reviewers = await $resolveReviewers(
        {
          delegatedApproval: delegatedApprovalAfterUpdate,
          enforcementLevel: enforcementLevel ?? current.enforcementLevel,
          allowedSelfApprovals,
          approvers,
          bypassers,
          approvalsRequired,
          approvals: approvals ?? current.approvals
        },
        { projectId: current.projectId, orgId: actorOrgId },
        tx
      );
      if (involvesDelegatedApproval) await $assertNoPendingRequests(current, tx);

      await approvalPolicyDAL.updateById(
        policy.id,
        {
          name,
          enforcementLevel,
          constraints: {
            version: 1,
            constraints: {
              allowedSelfApprovals,
              requestExpirationTime:
                requestExpirationTime === undefined ? current.requestExpirationTime : requestExpirationTime,
              maxTimePeriod: maxTimePeriod === undefined ? current.maxTimePeriod : maxTimePeriod
            }
          }
        },
        tx
      );

      await approvalPolicyStepsDAL.delete({ policyId: policy.id }, tx);
      await approvalPolicyBypassersDAL.delete({ policyId: policy.id }, tx);
      if (!delegatedApprovalAfterUpdate) await $insertStepsAndBypassers({ policyId: policy.id, ...reviewers }, tx);

      if (scopeChanged) {
        await $replacePolicyScope(
          { policyId: policy.id, envs, secretPath: nextSecretPath, steps: reviewers.steps },
          tx
        );
      }

      await $applyDelegatedApprovalChange(
        { policyId: policy.id, existing: existingDelegatedApproval, incoming: delegatedApproval },
        tx
      );

      const [updatedPolicy] = await secretAccessApprovalGlobalPolicyBridgeDAL.findSecretAccessPolicies(
        { policyId: policy.id },
        tx
      );
      return updatedPolicy;
    });
  };

  const deleteAccessApprovalPolicy = async ({
    policyId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteSecretAccessApprovalGlobalPolicyDTO) => {
    const policy = await $findPolicyById(
      policyId,
      actorOrgId,
      `Secret approval policy with ID '${policyId}' not found`
    );

    const permission = await $getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: policy.projectId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.SecretApproval
    );

    await approvalPolicyDAL.transaction(async (tx) => {
      await approvalRequestDAL.update(
        { policyId: policy.id, status: ApprovalRequestStatus.Pending },
        { status: ApprovalRequestStatus.Cancelled },
        tx
      );

      const requests = await approvalRequestDAL.find({ policyId: policy.id }, { tx });
      await revokeActiveSecretAccessGrants(
        {
          requestIds: requests.map((request) => request.id),
          revokedByUserId: actor === ActorType.USER ? actorId : null
        },
        { approvalRequestGrantsDAL, additionalPrivilegeDAL },
        tx
      );

      await approvalPolicyDAL.deleteById(policy.id, tx);

      await accessApprovalPolicyDAL.update({ id: policy.id, deletedAt: null }, { deletedAt: new Date() }, tx);
    });

    return policy;
  };

  const getAccessApprovalPolicyById = async ({
    policyId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetSecretAccessApprovalGlobalPolicyByIdDTO) => {
    const policy = await $findPolicyById(
      policyId,
      actorOrgId,
      `Cannot find access approval policy with ID ${policyId}`
    );

    const permission = await $getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: policy.projectId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

    return policy;
  };

  const listAccessApprovalPolicies = ({ projectId }: TListSecretAccessApprovalGlobalPoliciesDTO) =>
    secretAccessApprovalGlobalPolicyBridgeDAL.findSecretAccessPolicies({ projectId });

  const countAccessApprovalPolicies = async ({ projectId, envId }: TCountSecretAccessApprovalGlobalPoliciesDTO) => {
    const policies = await secretAccessApprovalGlobalPolicyBridgeDAL.findSecretAccessPolicies({ projectId, envId });
    return policies.length;
  };

  return {
    createAccessApprovalPolicy,
    updateAccessApprovalPolicy,
    deleteAccessApprovalPolicy,
    getAccessApprovalPolicyById,
    listAccessApprovalPolicies,
    countAccessApprovalPolicies
  };
};
