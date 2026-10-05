import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, TApprovalPolicies } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import {
  TApprovalPolicyBypassersDALFactory,
  TApprovalPolicyDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "@app/services/approval-policy/approval-policy-dal";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TSecretApprovalPolicyDALFactory } from "../secret-approval-policy/secret-approval-policy-dal";
import { secretChangePolicyFnsFactory, splitApprovers } from "./secret-change-policy-bridge-fns";
import {
  TSecretChangePolicy,
  TSecretChangePolicyBridgeMethods,
  TSecretChangePolicyEnvironment
} from "./secret-change-policy-bridge-types";
import { TApprovalPolicySecretEnvironmentDALFactory } from "./secret-change-policy-environment-dal";

type TSecretChangePolicyBridgeServiceFactoryDep = {
  approvalPolicyDAL: Pick<
    TApprovalPolicyDALFactory,
    "findOne" | "findByIdForUpdate" | "create" | "updateById" | "deleteById" | "transaction"
  >;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "create" | "findOne" | "updateById">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "insertMany" | "delete">;
  approvalPolicyBypassersDAL: Pick<TApprovalPolicyBypassersDALFactory, "insertMany" | "delete">;
  approvalPolicySecretEnvironmentDAL: Pick<
    TApprovalPolicySecretEnvironmentDALFactory,
    "insertMany" | "delete" | "findPolicyByEnvIdAndSecretPath" | "findEnvironmentsByPolicyId"
  >;
  secretApprovalPolicyDAL: Pick<TSecretApprovalPolicyDALFactory, "findPolicyByEnvIdAndSecretPath">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  projectDAL: Pick<TProjectDALFactory, "findEffectiveProjectSubjectsMembership">;
  userDAL: Pick<TUserDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TSecretChangePolicyBridgeServiceFactory = ReturnType<typeof secretChangePolicyBridgeServiceFactory>;

const notAvailable = () =>
  new BadRequestError({ message: "Secret change policies on the approval system are not available yet." });

export const secretChangePolicyBridgeServiceFactory = ({
  approvalPolicyDAL,
  approvalPolicyStepsDAL,
  approvalPolicyStepApproversDAL,
  approvalPolicyBypassersDAL,
  approvalPolicySecretEnvironmentDAL,
  secretApprovalPolicyDAL,
  projectEnvDAL,
  projectDAL,
  userDAL,
  permissionService,
  licenseService
}: TSecretChangePolicyBridgeServiceFactoryDep) => {
  const {
    findSecretChangePolicy,
    findSecretChangePolicyBySecretPath,
    assertNoPolicyForSecretPath,
    resolveBypassers,
    resolveApproverUserIds,
    verifyPolicyActorsMembership,
    getSecretChangePolicyState,
    updatePolicy
  } = secretChangePolicyFnsFactory({
    approvalPolicyDAL,
    approvalPolicyStepsDAL,
    approvalPolicyStepApproversDAL,
    approvalPolicyBypassersDAL,
    approvalPolicySecretEnvironmentDAL,
    secretApprovalPolicyDAL,
    projectDAL,
    userDAL
  });

  const $toSecretChangePolicy = (
    policy: TApprovalPolicies,
    {
      envs,
      approvals,
      secretPath,
      allowedSelfApprovals,
      deletedAt = null
    }: {
      envs: TSecretChangePolicyEnvironment[];
      approvals: number;
      secretPath: string;
      allowedSelfApprovals: boolean;
      deletedAt?: Date | null;
    }
  ): TSecretChangePolicy => ({
    id: policy.id,
    name: policy.name,
    secretPath,
    approvals,
    envId: envs[0].id,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
    enforcementLevel: policy.enforcementLevel,
    deletedAt,
    allowedSelfApprovals,
    bypassForMachineIdentities: policy.bypassForMachineIdentities ?? false,
    projectId: policy.projectId,
    environments: envs,
    environment: envs[0]
  });

  const $findSecretChangePolicyOrThrow = async (secretPolicyId: string) => {
    const policy = await findSecretChangePolicy(secretPolicyId);
    if (!policy) {
      throw new NotFoundError({ message: `Secret approval policy with ID '${secretPolicyId}' not found` });
    }
    return policy;
  };

  const createSecretChangePolicy: TSecretChangePolicyBridgeMethods["createSecretChangePolicy"] = async ({
    name,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    approvals,
    approvers,
    bypassers,
    projectId,
    secretPath,
    environment,
    environments,
    enforcementLevel,
    allowedSelfApprovals,
    bypassForMachineIdentities
  }) => {
    const { groupApprovers, userApprovers, userApproverNames } = splitApprovers(approvers);

    if (!groupApprovers.length && approvals > approvers.length)
      throw new BadRequestError({ message: "Approvals cannot be greater than approvers" });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretApproval
    );

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to create secret approval policy due to plan restriction. Upgrade plan to create secret approval policy."
      });
    }

    const mergedEnvs = (environment ? [environment] : environments) || [];
    if (mergedEnvs.length === 0) {
      throw new BadRequestError({ message: "Must provide either environment or environments" });
    }
    const envs = await projectEnvDAL.find({ $in: { slug: mergedEnvs }, projectId });
    if (!envs.length || envs.length !== mergedEnvs.length) {
      const notFoundEnvs = mergedEnvs.filter((env) => !envs.find((el) => el.slug === env));
      throw new NotFoundError({ message: `One or more environments not found: ${notFoundEnvs.join(", ")}` });
    }

    await assertNoPolicyForSecretPath({ envs, secretPath });

    const { bypasserUserIds, groupBypassers } = await resolveBypassers(bypassers);
    const userApproverIds = await resolveApproverUserIds({ userApprovers, userApproverNames });

    await verifyPolicyActorsMembership({
      userApproverIds,
      groupApprovers,
      bypasserUserIds,
      groupBypassers,
      orgId: actorOrgId,
      projectId
    });

    const policy = await approvalPolicyDAL.transaction(async (tx) => {
      const doc = await approvalPolicyDAL.create(
        {
          projectId,
          organizationId: actorOrgId,
          type: ApprovalPolicyType.SecretChange,
          name,
          enforcementLevel,
          bypassForMachineIdentities,
          conditions: { version: 1, conditions: [] },
          constraints: { version: 1, constraints: { allowedSelfApprovals } },
          scopeType: null,
          scopeId: null
        },
        tx
      );

      const step = await approvalPolicyStepsDAL.create(
        {
          policyId: doc.id,
          stepNumber: 1,
          requiredApprovals: approvals
        },
        tx
      );

      await approvalPolicyStepApproversDAL.insertMany(
        [
          ...userApproverIds.map((userId) => ({ policyStepId: step.id, userId, groupId: null })),
          ...groupApprovers.map((groupId) => ({ policyStepId: step.id, userId: null, groupId }))
        ],
        tx
      );

      await approvalPolicyBypassersDAL.insertMany(
        [
          ...bypasserUserIds.map((userId) => ({ policyId: doc.id, userId, groupId: null })),
          ...groupBypassers.map((groupId) => ({ policyId: doc.id, userId: null, groupId }))
        ],
        tx
      );

      await approvalPolicySecretEnvironmentDAL.insertMany(
        envs.map((env) => ({ policyId: doc.id, envId: env.id, secretPath })),
        tx
      );

      return doc;
    });

    return $toSecretChangePolicy(policy, { envs, approvals, secretPath, allowedSelfApprovals });
  };

  const updateSecretChangePolicy: TSecretChangePolicyBridgeMethods["updateSecretChangePolicy"] = async ({
    secretPolicyId,
    name,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    approvals,
    approvers,
    bypassers,
    secretPath,
    environments,
    enforcementLevel,
    allowedSelfApprovals,
    bypassForMachineIdentities
  }) => {
    const { groupApprovers, userApprovers, userApproverNames } = splitApprovers(approvers);

    const policy = await $findSecretChangePolicyOrThrow(secretPolicyId);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: policy.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretApproval);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to update secret approval policy due to plan restriction. Upgrade plan to update secret approval policy."
      });
    }

    let requestedEnvs: TSecretChangePolicyEnvironment[] | undefined;
    if (environments) {
      const envSlugs = [...new Set(environments)];
      if (!envSlugs.length) {
        throw new BadRequestError({ message: "At least one environment must be provided" });
      }
      const foundEnvs = await projectEnvDAL.find({ $in: { slug: envSlugs }, projectId: policy.projectId });
      if (foundEnvs.length !== envSlugs.length) {
        const notFoundEnvs = envSlugs.filter((slug) => !foundEnvs.find((el) => el.slug === slug));
        throw new NotFoundError({ message: `One or more environments not found: ${notFoundEnvs.join(", ")}` });
      }
      requestedEnvs = foundEnvs.map(({ id, slug, name: envName }) => ({ id, slug, name: envName }));
    }

    const { bypasserUserIds, groupBypassers } = await resolveBypassers(bypassers);
    const userApproverIds = await resolveApproverUserIds({ userApprovers, userApproverNames });

    await verifyPolicyActorsMembership({
      userApproverIds,
      groupApprovers,
      bypasserUserIds,
      groupBypassers,
      orgId: actorOrgId,
      projectId: policy.projectId
    });

    const updated = await updatePolicy({
      policy,
      name,
      approvals,
      secretPath,
      enforcementLevel,
      allowedSelfApprovals,
      bypassForMachineIdentities,
      requestedEnvs,
      approverCount: approvers.length,
      userApproverIds,
      groupApprovers,
      bypasserUserIds,
      groupBypassers
    });

    return $toSecretChangePolicy(updated.policy, updated);
  };

  const deleteSecretChangePolicy: TSecretChangePolicyBridgeMethods["deleteSecretChangePolicy"] = async ({
    secretPolicyId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }) => {
    const policy = await $findSecretChangePolicyOrThrow(secretPolicyId);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: policy.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.SecretApproval
    );

    const current = await getSecretChangePolicyState(policy);

    // Legacy delete closes the policy's open requests. Secret change requests are not created on the
    // approval system yet, so cancelling them moves with the request migration.
    await approvalPolicyDAL.deleteById(policy.id);

    return $toSecretChangePolicy(policy, {
      envs: current.envs,
      approvals: current.approvals,
      secretPath: current.secretPath,
      allowedSelfApprovals: current.allowedSelfApprovals,
      deletedAt: new Date()
    });
  };

  const getSecretChangePolicy: TSecretChangePolicyBridgeMethods["getSecretChangePolicy"] = async () => {
    throw notAvailable();
  };

  const getSecretChangePolicyByPaths: TSecretChangePolicyBridgeMethods["getSecretChangePolicyByPaths"] = async () => {
    throw notAvailable();
  };

  const getSecretChangePolicyByProjectId: TSecretChangePolicyBridgeMethods["getSecretChangePolicyByProjectId"] =
    async () => {
      throw notAvailable();
    };

  const getSecretChangePolicyOfFolder: TSecretChangePolicyBridgeMethods["getSecretChangePolicyOfFolder"] = async () => {
    throw notAvailable();
  };

  const getSecretChangePolicyById: TSecretChangePolicyBridgeMethods["getSecretChangePolicyById"] = async () => {
    throw notAvailable();
  };

  return {
    findSecretChangePolicy,
    findSecretChangePolicyBySecretPath,
    createSecretChangePolicy,
    updateSecretChangePolicy,
    deleteSecretChangePolicy,
    getSecretChangePolicy,
    getSecretChangePolicyByPaths,
    getSecretChangePolicyByProjectId,
    getSecretChangePolicyOfFolder,
    getSecretChangePolicyById
  };
};
