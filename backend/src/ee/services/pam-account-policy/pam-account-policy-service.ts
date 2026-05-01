import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPamAccountPolicyActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { TPamAccountPolicyDALFactory } from "./pam-account-policy-dal";
import {
  TCreatePamAccountPolicyDTO,
  TDeletePamAccountPolicyDTO,
  TGetPamAccountPolicyByIdDTO,
  TListPamAccountPoliciesDTO,
  TUpdatePamAccountPolicyDTO
} from "./pam-account-policy-types";

type TPamAccountPolicyServiceFactoryDep = {
  pamAccountPolicyDAL: TPamAccountPolicyDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TPamAccountPolicyServiceFactory = ReturnType<typeof pamAccountPolicyServiceFactory>;

export const pamAccountPolicyServiceFactory = ({
  pamAccountPolicyDAL,
  permissionService
}: TPamAccountPolicyServiceFactoryDep) => {
  const create = async (
    { projectId, name, description, rules }: TCreatePamAccountPolicyDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountPolicyActions.Create,
      ProjectPermissionSub.PamAccountPolicies
    );

    const existing = await pamAccountPolicyDAL.findOne({ projectId, name });
    if (existing) {
      throw new BadRequestError({ message: `A policy with name '${name}' already exists in this project` });
    }

    const policy = await pamAccountPolicyDAL.create({
      projectId,
      name,
      description,
      rules
    });

    return policy;
  };

  const updateById = async (
    { policyId, name, description, rules, isActive }: TUpdatePamAccountPolicyDTO,
    actor: OrgServiceActor
  ) => {
    const existingPolicy = await pamAccountPolicyDAL.findById(policyId);
    if (!existingPolicy) throw new NotFoundError({ message: "Policy not found" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: existingPolicy.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountPolicyActions.Edit,
      ProjectPermissionSub.PamAccountPolicies
    );

    if (name && name !== existingPolicy.name) {
      const duplicate = await pamAccountPolicyDAL.findOne({ projectId: existingPolicy.projectId, name });
      if (duplicate) {
        throw new BadRequestError({ message: `A policy with name '${name}' already exists in this project` });
      }
    }

    const policy = await pamAccountPolicyDAL.updateById(policyId, {
      name,
      description,
      rules,
      isActive
    });

    return policy;
  };

  const deleteById = async ({ policyId }: TDeletePamAccountPolicyDTO, actor: OrgServiceActor) => {
    const existingPolicy = await pamAccountPolicyDAL.findById(policyId);
    if (!existingPolicy) throw new NotFoundError({ message: "Policy not found" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: existingPolicy.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountPolicyActions.Delete,
      ProjectPermissionSub.PamAccountPolicies
    );

    const policy = await pamAccountPolicyDAL.deleteById(policyId);

    return policy;
  };

  const list = async ({ projectId, search }: TListPamAccountPoliciesDTO, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountPolicyActions.Read,
      ProjectPermissionSub.PamAccountPolicies
    );

    const policies = await pamAccountPolicyDAL.findByProjectId(projectId, search);

    return policies;
  };

  const getById = async ({ policyId }: TGetPamAccountPolicyByIdDTO, actor: OrgServiceActor) => {
    const policy = await pamAccountPolicyDAL.findById(policyId);
    if (!policy) throw new NotFoundError({ message: "Policy not found" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: policy.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountPolicyActions.Read,
      ProjectPermissionSub.PamAccountPolicies
    );

    return policy;
  };

  return {
    create,
    updateById,
    deleteById,
    list,
    getById
  };
};
