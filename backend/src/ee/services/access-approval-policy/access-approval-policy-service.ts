import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";

import { TAccessApprovalPolicyApproverDALFactory } from "./access-approval-policy-approver-dal";
import { TAccessApprovalPolicyDALFactory } from "./access-approval-policy-dal";
import {
  TCreateAccessApprovalPolicy,
  TDeleteAccessApprovalPolicy,
  TListAccessApprovalPoliciesDTO,
  TUpdateAccessApprovalPolicy
} from "./access-approval-policy-types";

type TSecretApprovalPolicyServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  accessApprovalPolicyDAL: TAccessApprovalPolicyDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  accessApprovalPolicyApproverDAL: TAccessApprovalPolicyApproverDALFactory;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "find">;
};

export type TAccessApprovalPolicyServiceFactory = ReturnType<typeof accessApprovalPolicyServiceFactory>;

export const accessApprovalPolicyServiceFactory = ({
  accessApprovalPolicyDAL,
  accessApprovalPolicyApproverDAL,
  permissionService,
  projectEnvDAL,
  projectMembershipDAL
}: TSecretApprovalPolicyServiceFactoryDep) => {
  const createAccessApprovalPolicy = async ({
    name,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    approvals,
    approvers,
    projectId,
    environment
  }: TCreateAccessApprovalPolicy) => {
    if (approvals > approvers.length)
      throw new BadRequestError({ message: "Approvals cannot be greater than approvers" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretApproval
    );
    const env = await projectEnvDAL.findOne({ slug: environment, projectId });
    if (!env) throw new BadRequestError({ message: "Environment not found" });

    const secretApprovers = await projectMembershipDAL.find({
      projectId,
      $in: { id: approvers }
    });
    if (secretApprovers.length !== approvers.length) {
      throw new BadRequestError({ message: "Approver not found in project" });
    }

    const accessApproval = await accessApprovalPolicyDAL.transaction(async (tx) => {
      const doc = await accessApprovalPolicyDAL.create(
        {
          envId: env.id,
          approvals,
          name
        },
        tx
      );
      await accessApprovalPolicyApproverDAL.insertMany(
        secretApprovers.map(({ id }) => ({
          approverId: id,
          policyId: doc.id
        })),
        tx
      );
      return doc;
    });
    return { ...accessApproval, environment: env, projectId };
  };

  const getAccessApprovalPolicyByProjectId = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TListAccessApprovalPoliciesDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

    const accessApprovalPolicies = await accessApprovalPolicyDAL.find({ projectId });
    return accessApprovalPolicies;
  };

  const updateAccessApprovalPolicy = async ({
    policyId,
    approvers,
    name,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    approvals
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
          name
        },
        tx
      );
      if (approvers) {
        // Find the workspace project memberships of the users passed in the approvers array
        const secretApprovers = await projectMembershipDAL.find(
          {
            projectId: accessApprovalPolicy.projectId,
            $in: { id: approvers }
          },
          { tx }
        );
        if (secretApprovers.length !== approvers.length)
          throw new BadRequestError({ message: "Approver not found in project" });
        if (doc.approvals > secretApprovers.length)
          throw new BadRequestError({ message: "Approvals cannot be greater than approvers" });
        await accessApprovalPolicyApproverDAL.delete({ policyId: doc.id }, tx);
        await accessApprovalPolicyApproverDAL.insertMany(
          secretApprovers.map(({ id }) => ({
            approverId: id,
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

  return {
    createAccessApprovalPolicy,
    deleteAccessApprovalPolicy,
    updateAccessApprovalPolicy,
    getAccessApprovalPolicyByProjectId
  };
};
