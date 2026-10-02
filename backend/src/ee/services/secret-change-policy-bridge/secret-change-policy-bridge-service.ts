import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { ActionProjectType, TApprovalPolicies, TProjectEnvironments } from "@app/db/schemas";
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

import { ApproverType } from "../access-approval-policy/access-approval-policy-types";
import { TLicenseServiceFactory } from "../license/license-service";
import { TSecretApprovalPolicyDALFactory } from "../secret-approval-policy/secret-approval-policy-dal";
import { secretChangePolicyFnsFactory } from "./secret-change-policy-bridge-fns";
import { TSecretChangePolicy, TSecretChangePolicyBridgeMethods } from "./secret-change-policy-bridge-types";
import { TApprovalPolicySecretEnvironmentDALFactory } from "./secret-change-policy-environment-dal";

type TSecretChangePolicyBridgeServiceFactoryDep = {
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findOne" | "create" | "transaction">;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "create">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "insertMany">;
  approvalPolicyBypassersDAL: Pick<TApprovalPolicyBypassersDALFactory, "insertMany">;
  approvalPolicySecretEnvironmentDAL: Pick<
    TApprovalPolicySecretEnvironmentDALFactory,
    "insertMany" | "findPolicyByEnvIdAndSecretPath"
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
  const { assertNoPolicyForSecretPath, resolveBypassers, resolveApproverUserIds, verifyPolicyActorsMembership } =
    secretChangePolicyFnsFactory({
      approvalPolicySecretEnvironmentDAL,
      secretApprovalPolicyDAL,
      projectDAL,
      userDAL
    });

  const findSecretChangePolicy = (policyId: string, tx?: Knex) =>
    approvalPolicyDAL.findOne({ id: policyId, type: ApprovalPolicyType.SecretChange }, tx);

  const $toSecretChangePolicy = (
    policy: TApprovalPolicies,
    {
      envs,
      approvals,
      secretPath,
      allowedSelfApprovals
    }: { envs: TProjectEnvironments[]; approvals: number; secretPath: string; allowedSelfApprovals: boolean }
  ): TSecretChangePolicy => ({
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
    bypassForMachineIdentities: policy.bypassForMachineIdentities ?? false,
    projectId: policy.projectId,
    environments: envs,
    environment: envs[0]
  });

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
    const groupApprovers = approvers
      .filter((approver) => approver.type === ApproverType.Group)
      .map((approver) => approver.id)
      .filter(Boolean) as string[];
    const userApprovers = approvers
      .filter((approver) => approver.type === ApproverType.User)
      .map((approver) => approver.id)
      .filter(Boolean) as string[];
    const userApproverNames = approvers
      .map((approver) => (approver.type === ApproverType.User ? approver.username : undefined))
      .filter(Boolean) as string[];

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

  const updateSecretChangePolicy: TSecretChangePolicyBridgeMethods["updateSecretChangePolicy"] = async () => {
    throw notAvailable();
  };

  const deleteSecretChangePolicy: TSecretChangePolicyBridgeMethods["deleteSecretChangePolicy"] = async () => {
    throw notAvailable();
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
