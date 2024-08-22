import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";

import { TAccessApprovalPolicyApproverDALFactory } from "./access-approval-policy-approver-dal";
import { TAccessApprovalPolicyDALFactory } from "./access-approval-policy-dal";
import { verifyApprovers } from "./access-approval-policy-fns";
import {
  TCreateAccessApprovalPolicy,
  TDeleteAccessApprovalPolicy,
  TGetAccessPolicyCountByEnvironmentDTO,
  TListAccessApprovalPoliciesDTO,
  TUpdateAccessApprovalPolicy
} from "./access-approval-policy-types";

type TSecretApprovalPolicyServiceFactoryDep = {
  projectDAL: TProjectDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  accessApprovalPolicyDAL: TAccessApprovalPolicyDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find" | "findOne">;
  accessApprovalPolicyApproverDAL: TAccessApprovalPolicyApproverDALFactory;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "find">;
};

export type TAccessApprovalPolicyServiceFactory = ReturnType<typeof accessApprovalPolicyServiceFactory>;

export const accessApprovalPolicyServiceFactory = ({
  accessApprovalPolicyDAL,
  accessApprovalPolicyApproverDAL,
  permissionService,
  projectEnvDAL,
  projectDAL
}: TSecretApprovalPolicyServiceFactoryDep) => {
  const createAccessApprovalPolicy = async ({
    name,
    actor,
    actorId,
    actorOrgId,
    secretPath,
    actorAuthMethod,
    approvals,
    approverUserIds,
    projectSlug,
    environment,
    enforcementLevel
  }: TCreateAccessApprovalPolicy) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });

    if (approvals > approverUserIds.length)
      throw new BadRequestError({ message: "Approvals cannot be greater than approvers" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretApproval
    );
    const env = await projectEnvDAL.findOne({ slug: environment, projectId: project.id });
    if (!env) throw new BadRequestError({ message: "Environment not found" });

    await verifyApprovers({
      projectId: project.id,
      orgId: actorOrgId,
      envSlug: environment,
      secretPath,
      actorAuthMethod,
      permissionService,
      userIds: approverUserIds
    });

    const accessApproval = await accessApprovalPolicyDAL.transaction(async (tx) => {
      const doc = await accessApprovalPolicyDAL.create(
        {
          envId: env.id,
          approvals,
          secretPath,
          name,
          enforcementLevel
        },
        tx
      );
      await accessApprovalPolicyApproverDAL.insertMany(
        approverUserIds.map((userId) => ({
          approverUserId: userId,
          policyId: doc.id
        })),
        tx
      );
      return doc;
    });
    return { ...accessApproval, environment: env, projectId: project.id };
  };

  const getAccessApprovalPolicyByProjectSlug = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectSlug
  }: TListAccessApprovalPoliciesDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });

    // Anyone in the project should be able to get the policies.
    /* const { permission } = */ await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );
    // ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

    const accessApprovalPolicies = await accessApprovalPolicyDAL.find({ projectId: project.id });
    return accessApprovalPolicies;
  };

  const updateAccessApprovalPolicy = async ({
    policyId,
    approverUserIds,
    secretPath,
    name,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    approvals,
    enforcementLevel
  }: TUpdateAccessApprovalPolicy) => {
    const accessApprovalPolicy = await accessApprovalPolicyDAL.findById(policyId);
    if (!accessApprovalPolicy) throw new BadRequestError({ message: "Secret approval policy not found" });
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      accessApprovalPolicy.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretApproval);

    const updatedPolicy = await accessApprovalPolicyDAL.transaction(async (tx) => {
      const doc = await accessApprovalPolicyDAL.updateById(
        accessApprovalPolicy.id,
        {
          approvals,
          secretPath,
          name,
          enforcementLevel
        },
        tx
      );
      if (approverUserIds) {
        await verifyApprovers({
          projectId: accessApprovalPolicy.projectId,
          orgId: actorOrgId,
          envSlug: accessApprovalPolicy.environment.slug,
          secretPath: doc.secretPath!,
          actorAuthMethod,
          permissionService,
          userIds: approverUserIds
        });

        await accessApprovalPolicyApproverDAL.delete({ policyId: doc.id }, tx);
        await accessApprovalPolicyApproverDAL.insertMany(
          approverUserIds.map((userId) => ({
            approverUserId: userId,
            policyId: doc.id
          })),
          tx
        );
      }
      return doc;
    });
    return {
      ...updatedPolicy,
      environment: accessApprovalPolicy.environment,
      projectId: accessApprovalPolicy.projectId
    };
  };

  const deleteAccessApprovalPolicy = async ({
    policyId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteAccessApprovalPolicy) => {
    const policy = await accessApprovalPolicyDAL.findById(policyId);
    if (!policy) throw new BadRequestError({ message: "Secret approval policy not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      policy.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.SecretApproval
    );

    await accessApprovalPolicyDAL.deleteById(policyId);
    return policy;
  };

  const getAccessPolicyCountByEnvSlug = async ({
    actor,
    actorOrgId,
    actorAuthMethod,
    projectSlug,
    actorId,
    envSlug
  }: TGetAccessPolicyCountByEnvironmentDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);

    if (!project) throw new BadRequestError({ message: "Project not found" });

    const { membership } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );
    if (!membership) throw new BadRequestError({ message: "User not found in project" });

    const environment = await projectEnvDAL.findOne({ projectId: project.id, slug: envSlug });
    if (!environment) throw new BadRequestError({ message: "Environment not found" });

    const policies = await accessApprovalPolicyDAL.find({ envId: environment.id, projectId: project.id });
    if (!policies) throw new BadRequestError({ message: "No policies found" });

    return { count: policies.length };
  };

  return {
    getAccessPolicyCountByEnvSlug,
    createAccessApprovalPolicy,
    deleteAccessApprovalPolicy,
    updateAccessApprovalPolicy,
    getAccessApprovalPolicyByProjectSlug
  };
};
