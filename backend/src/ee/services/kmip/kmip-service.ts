import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";

import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionKmipActions, ProjectPermissionSub } from "../permission/project-permission";
import { TKmipClientDALFactory } from "./kmip-client-dal";
import {
  TCreateKmipClientDTO,
  TDeleteKmipClientDTO,
  TGetKmipClientDTO,
  TListKmipClientsByProjectIdDTO,
  TUpdateKmipClientDTO
} from "./kmip-types";

type TKmipServiceFactoryDep = {
  kmipClientDAL: TKmipClientDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TKmipServiceFactory = ReturnType<typeof kmipServiceFactory>;

export const kmipServiceFactory = ({ kmipClientDAL, permissionService }: TKmipServiceFactoryDep) => {
  const createKmipClient = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    name,
    description,
    permissions
  }: TCreateKmipClientDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionKmipActions.CreateClients,
      ProjectPermissionSub.Kmip
    );

    const kmipClient = await kmipClientDAL.create({
      projectId,
      name,
      description,
      permissions
    });

    return kmipClient;
  };

  const updateKmipClient = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    name,
    description,
    permissions,
    id
  }: TUpdateKmipClientDTO) => {
    const kmipClient = await kmipClientDAL.findById(id);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: kmipClient.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionKmipActions.UpdateClients,
      ProjectPermissionSub.Kmip
    );

    const updatedKmipClient = await kmipClientDAL.updateById(id, {
      name,
      description,
      permissions
    });

    return updatedKmipClient;
  };

  const deleteKmipClient = async ({ actor, actorId, actorOrgId, actorAuthMethod, id }: TDeleteKmipClientDTO) => {
    const kmipClient = await kmipClientDAL.findById(id);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: kmipClient.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionKmipActions.DeleteClients,
      ProjectPermissionSub.Kmip
    );

    const deletedKmipClient = await kmipClientDAL.deleteById(id);

    return deletedKmipClient;
  };

  const getKmipClient = async ({ actor, actorId, actorOrgId, actorAuthMethod, id }: TGetKmipClientDTO) => {
    const kmipClient = await kmipClientDAL.findById(id);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: kmipClient.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionKmipActions.ReadClients, ProjectPermissionSub.Kmip);

    return kmipClient;
  };

  const listKmipClientsByProjectId = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    ...rest
  }: TListKmipClientsByProjectIdDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionKmipActions.ReadClients, ProjectPermissionSub.Kmip);

    return kmipClientDAL.findByProjectId({ projectId, ...rest });
  };

  return { createKmipClient, updateKmipClient, deleteKmipClient, getKmipClient, listKmipClientsByProjectId };
};
