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
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ApprovalPolicyType, ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { insertApprovalRequestSteps } from "@app/services/approval-policy/approval-request-fns";
import { ActorType } from "@app/services/auth/auth-type";

import {
  buildSecretAccessPolicySteps,
  revokeActiveSecretAccessGrants,
  secretAccessApprovalPolicyExists
} from "./secret-access-approval-policy-bridge-fns";
import {
  TCountSecretAccessApprovalPoliciesDTO,
  TCreateSecretAccessApprovalPolicyDTO,
  TDeleteSecretAccessApprovalPolicyDTO,
  TGetSecretAccessApprovalPolicyByIdDTO,
  TListSecretAccessApprovalPoliciesDTO,
  TSecretAccessApprovalPolicyBridgeServiceFactoryDep,
  TUpdateSecretAccessApprovalPolicyDTO
} from "./secret-access-approval-policy-bridge-types";

export type TSecretAccessApprovalPolicyBridgeServiceFactory = ReturnType<
  typeof secretAccessApprovalPolicyBridgeServiceFactory
>;

type TApproverInput = TCreateAccessApprovalPolicy["approvers"];
type TBypasserInput = NonNullable<TCreateAccessApprovalPolicy["bypassers"]>;
type TSequencedSubject = { id: string; sequence?: number };
type TPolicyStep = {
  requiredApprovals: number;
  approvers: { type: ApproverType; id: string }[];
};

export const secretAccessApprovalPolicyBridgeServiceFactory = ({
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
  secretAccessApprovalPolicyBridgeDAL,
  approvalRequestDAL,
  approvalRequestStepsDAL,
  approvalRequestStepEligibleApproversDAL,
  approvalRequestGrantsDAL,
  additionalPrivilegeDAL
}: TSecretAccessApprovalPolicyBridgeServiceFactoryDep) => {
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
    { projectId, orgId }: { projectId: string; orgId: string }
  ) => {
    const { groupApprovers, userApprovers, userApproverNames } = $splitApprovers(approvers);

    let approverUserIds = userApprovers;
    if (userApproverNames.length) {
      const approverUsersInDB = await userDAL.find({
        $in: {
          username: userApproverNames.map((el) => el.username)
        }
      });
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
        projectId
      });
    }

    return { approverUserIds, groupApprovers };
  };

  const $resolveBypassers = async (
    bypassers: TBypasserInput | undefined,
    { projectId, orgId }: { projectId: string; orgId: string }
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
      bypasserUserIds = [...new Set(bypasserUserIds)];

      if (groupBypassers.length > 0) {
        const orgGroups = await groupDAL.find({
          $in: { id: groupBypassers },
          orgId
        });

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
          projectId
        });
      }
    }

    return { bypasserUserIds, groupBypassers };
  };

  const $buildSteps = ({
    approverUserIds,
    groupApprovers,
    approvalsRequired
  }: {
    approverUserIds: TSequencedSubject[];
    groupApprovers: TSequencedSubject[];
    approvalsRequired?: { numberOfApprovals: number; stepNumber: number }[];
  }): TPolicyStep[] =>
    buildSecretAccessPolicySteps(
      [
        ...approverUserIds.map((el) => ({ type: ApproverType.User, id: el.id, sequence: el.sequence ?? 1 })),
        ...groupApprovers.map((el) => ({ type: ApproverType.Group, id: el.id, sequence: el.sequence ?? 1 }))
      ],
      approvalsRequired
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

  const $getProjectPermission = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId
  }: Pick<TUpdateSecretAccessApprovalPolicyDTO, "actor" | "actorId" | "actorAuthMethod" | "actorOrgId"> & {
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

  const $findPolicyById = async (policyId: string, organizationId: string, message: string) => {
    const [policy] = await secretAccessApprovalPolicyBridgeDAL.findSecretAccessPolicies({ policyId, organizationId });
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

    const conflictingEnvId = await secretAccessApprovalPolicyExists(
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
    allowedSelfApprovals,
    approvalsRequired,
    maxTimePeriod,
    requestExpirationTime
  }: TCreateSecretAccessApprovalPolicyDTO) => {
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

    const mergedEnvs = (environment ? [environment] : environments) || [];
    if (mergedEnvs.length === 0) {
      throw new BadRequestError({ message: "Must provide either environment or environments" });
    }
    const envs = await projectEnvDAL.find({ $in: { slug: mergedEnvs }, projectId: project.id });
    if (!envs.length || envs.length !== mergedEnvs.length) {
      const notFoundEnvs = mergedEnvs.filter((env) => !envs.find((el) => el.slug === env));
      throw new NotFoundError({ message: `One or more environments not found: ${notFoundEnvs.join(", ")}` });
    }

    const scope = { projectId: project.id, orgId: project.orgId };
    const { approverUserIds, groupApprovers } = await $resolveApprovers(approvers, scope);
    const { bypasserUserIds, groupBypassers } = await $resolveBypassers(bypassers, scope);
    const steps = $buildSteps({ approverUserIds, groupApprovers, approvalsRequired });

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

      await $insertStepsAndBypassers({ policyId: doc.id, steps, bypasserUserIds, groupBypassers }, tx);

      return doc;
    });

    return {
      id: policy.id,
      name: policy.name,
      secretPath,
      approvals,
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
      projectId: project.id
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
    enforcementLevel,
    allowedSelfApprovals,
    approvalsRequired,
    environments,
    maxTimePeriod,
    requestExpirationTime
  }: TUpdateSecretAccessApprovalPolicyDTO) => {
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

    const scope = { projectId: policy.projectId, orgId: actorOrgId };
    const { approverUserIds, groupApprovers } = await $resolveApprovers(approvers, scope);
    const { bypasserUserIds, groupBypassers } = await $resolveBypassers(bypassers, scope);
    const steps = $buildSteps({ approverUserIds, groupApprovers, approvalsRequired });

    return approvalPolicyDAL.transaction(async (tx) => {
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
                requestExpirationTime === undefined ? policy.requestExpirationTime : requestExpirationTime,
              maxTimePeriod: maxTimePeriod === undefined ? policy.maxTimePeriod : maxTimePeriod
            }
          }
        },
        tx
      );

      await approvalPolicyStepsDAL.delete({ policyId: policy.id }, tx);
      await approvalPolicyBypassersDAL.delete({ policyId: policy.id }, tx);
      await $insertStepsAndBypassers({ policyId: policy.id, steps, bypasserUserIds, groupBypassers }, tx);

      if (scopeChanged) {
        await approvalPolicySecretEnvironmentDAL.findByPolicyIdForUpdate(policy.id, tx);
        // make sure that the updated secret path is not conflicting with any other policy
        await $assertNoConflictingPolicy({ envs, secretPath: nextSecretPath, excludePolicyId: policy.id }, tx);
        await approvalPolicySecretEnvironmentDAL.delete({ policyId: policy.id }, tx);
        await approvalPolicySecretEnvironmentDAL.insertMany(
          envs.map((env) => ({ policyId: policy.id, envId: env.id, secretPath: nextSecretPath })),
          tx
        );
        await $resetPendingRequestSteps({ policyId: policy.id, steps }, tx);
      }

      const [updatedPolicy] = await secretAccessApprovalPolicyBridgeDAL.findSecretAccessPolicies(
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
  }: TDeleteSecretAccessApprovalPolicyDTO) => {
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
    });

    return policy;
  };

  const getAccessApprovalPolicyById = async ({
    policyId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetSecretAccessApprovalPolicyByIdDTO) => {
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

  const listAccessApprovalPolicies = ({ projectId }: TListSecretAccessApprovalPoliciesDTO) =>
    secretAccessApprovalPolicyBridgeDAL.findSecretAccessPolicies({ projectId });

  const countAccessApprovalPolicies = async ({ projectId, envId }: TCountSecretAccessApprovalPoliciesDTO) => {
    const policies = await secretAccessApprovalPolicyBridgeDAL.findSecretAccessPolicies({ projectId, envId });
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
