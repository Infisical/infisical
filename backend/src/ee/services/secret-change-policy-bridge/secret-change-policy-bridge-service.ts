import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, ProjectVersion } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import {
  TApprovalPolicyBypassersDALFactory,
  TApprovalPolicyDALFactory,
  TApprovalPolicySecretEnvironmentDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "@app/services/approval-policy/approval-policy-dal";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalRequestDALFactory } from "@app/services/approval-policy/approval-request-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TSecretApprovalPolicyDALFactory } from "../secret-approval-policy/secret-approval-policy-dal";
import { RequestState } from "../secret-approval-request/secret-approval-request-types";
import { TSecretChangePolicyBridgeDALFactory } from "./secret-change-policy-bridge-dal";
import { secretChangePolicyFnsFactory, splitApprovers, toSecretChangePolicy } from "./secret-change-policy-bridge-fns";
import { TSecretChangePolicyBridgeMethods, TSecretChangePolicyEnvironment } from "./secret-change-policy-bridge-types";

type TSecretChangePolicyBridgeServiceFactoryDep = {
  approvalPolicyDAL: Pick<
    TApprovalPolicyDALFactory,
    "findOne" | "findByIdForUpdate" | "create" | "updateById" | "deleteById" | "transaction"
  >;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "create" | "updateById">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "insertMany" | "delete">;
  approvalPolicyBypassersDAL: Pick<TApprovalPolicyBypassersDALFactory, "insertMany" | "delete">;
  approvalPolicySecretEnvironmentDAL: Pick<
    TApprovalPolicySecretEnvironmentDALFactory,
    "insertMany" | "delete" | "findSecretChangePolicyByEnvIdsAndSecretPath"
  >;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "update">;
  secretChangePolicyBridgeDAL: Pick<TSecretChangePolicyBridgeDALFactory, "findSecretChangePolicies">;
  secretApprovalPolicyDAL: Pick<TSecretApprovalPolicyDALFactory, "findPolicyByEnvIdAndSecretPath">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findEffectiveProjectSubjectsMembership">;
  userDAL: Pick<TUserDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TSecretChangePolicyBridgeServiceFactory = ReturnType<typeof secretChangePolicyBridgeServiceFactory>;

export const secretChangePolicyBridgeServiceFactory = ({
  approvalPolicyDAL,
  approvalPolicyStepsDAL,
  approvalPolicyStepApproversDAL,
  approvalPolicyBypassersDAL,
  approvalPolicySecretEnvironmentDAL,
  approvalRequestDAL,
  secretChangePolicyBridgeDAL,
  secretApprovalPolicyDAL,
  projectEnvDAL,
  projectDAL,
  userDAL,
  permissionService,
  licenseService
}: TSecretChangePolicyBridgeServiceFactoryDep) => {
  const {
    findSecretChangePolicy,
    findSecretChangePolicyById,
    findSecretChangePolicyBySecretPath,
    findSecretChangePoliciesByEnvId,
    findSecretChangePoliciesByProjectId,
    assertNoPolicyForSecretPath,
    resolveBypassers,
    resolveApproverUserIds,
    verifyPolicyActorsMembership,
    updatePolicy
  } = secretChangePolicyFnsFactory({
    approvalPolicyDAL,
    approvalPolicyStepsDAL,
    approvalPolicyStepApproversDAL,
    approvalPolicyBypassersDAL,
    approvalPolicySecretEnvironmentDAL,
    secretChangePolicyBridgeDAL,
    secretApprovalPolicyDAL,
    projectDAL,
    userDAL
  });

  // Scoped to the actor's org so an id from another tenant reads as not found rather than forbidden.
  const $findSecretChangePolicyOrThrow = async (secretPolicyId: string, organizationId: string) => {
    const [row] = await secretChangePolicyBridgeDAL.findSecretChangePolicies({
      policyId: secretPolicyId,
      organizationId
    });
    if (!row) {
      throw new NotFoundError({ message: `Secret approval policy with ID '${secretPolicyId}' not found` });
    }
    return toSecretChangePolicy(row);
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

    const project = await projectDAL.findById(projectId);
    if (!project) {
      throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    }
    if (project.version !== ProjectVersion.V3) {
      throw new BadRequestError({
        message:
          "Secret approval policies on the global approval system are only supported on projects that have been upgraded to the latest secrets version. Upgrade the project before creating one."
      });
    }

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

    return approvalPolicyDAL.transaction(async (tx) => {
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

      const [row] = await secretChangePolicyBridgeDAL.findSecretChangePolicies({ policyId: doc.id }, tx);
      return toSecretChangePolicy(row);
    });
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

    const policy = await $findSecretChangePolicyOrThrow(secretPolicyId, actorOrgId);

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

    return updatePolicy({
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
  };

  const deleteSecretChangePolicy: TSecretChangePolicyBridgeMethods["deleteSecretChangePolicy"] = async ({
    secretPolicyId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }) => {
    const policy = await $findSecretChangePolicyOrThrow(secretPolicyId, actorOrgId);

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

    await approvalPolicyDAL.transaction(async (tx) => {
      const lockedPolicy = await approvalPolicyDAL.findByIdForUpdate(policy.id, tx);
      if (!lockedPolicy) {
        throw new NotFoundError({ message: `Secret approval policy with ID '${policy.id}' not found` });
      }
      await approvalRequestDAL.update(
        { policyId: policy.id, status: RequestState.Open },
        { status: RequestState.Closed },
        tx
      );
      await approvalPolicyDAL.deleteById(policy.id, tx);
    });

    return { ...policy, deletedAt: new Date() };
  };

  const getSecretChangePolicyById: TSecretChangePolicyBridgeMethods["getSecretChangePolicyById"] = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    sapId
  }) => {
    const policy = await $findSecretChangePolicyOrThrow(sapId, actorOrgId);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: policy.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

    return policy;
  };

  return {
    findSecretChangePolicy,
    findSecretChangePolicyById,
    findSecretChangePolicyBySecretPath,
    findSecretChangePoliciesByEnvId,
    findSecretChangePoliciesByProjectId,
    createSecretChangePolicy,
    updateSecretChangePolicy,
    deleteSecretChangePolicy,
    getSecretChangePolicyById
  };
};
