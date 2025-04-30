import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSshHostDALFactory } from "@app/ee/services/ssh-host/ssh-host-dal";
import { TSshHostLoginUserMappingDALFactory } from "@app/ee/services/ssh-host/ssh-host-login-user-mapping-dal";
import { TSshHostLoginUserDALFactory } from "@app/ee/services/ssh-host/ssh-login-user-dal";
import { TSshHostGroupDALFactory } from "@app/ee/services/ssh-host-group/ssh-host-group-dal";
import { TSshHostGroupMembershipDALFactory } from "@app/ee/services/ssh-host-group/ssh-host-group-membership-dal";
import { NotFoundError } from "@app/lib/errors";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { createSshLoginMappings } from "../ssh-host/ssh-host-fns";
import {
  TAddHostToSshHostGroupDTO,
  TCreateSshHostGroupDTO,
  TDeleteSshHostGroupDTO,
  TGetSshHostGroupDTO,
  TListSshHostGroupHostsDTO,
  TRemoveHostFromSshHostGroupDTO,
  TUpdateSshHostGroupDTO
} from "./ssh-host-group-types";

type TSshHostGroupServiceFactoryDep = {
  sshHostDAL: TSshHostDALFactory; // TODO: Pick
  sshHostGroupDAL: Pick<
    TSshHostGroupDALFactory,
    | "create"
    | "updateById"
    | "findById"
    | "deleteById"
    | "transaction"
    | "findSshHostGroupByIdWithLoginMappings"
    | "findAllSshHostsInGroup"
  >;
  sshHostGroupMembershipDAL: TSshHostGroupMembershipDALFactory; // TODO: Pick
  sshHostLoginUserDAL: Pick<TSshHostLoginUserDALFactory, "create" | "transaction" | "delete">;
  sshHostLoginUserMappingDAL: Pick<TSshHostLoginUserMappingDALFactory, "insertMany">;
  userDAL: Pick<TUserDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getUserProjectPermission">;
};

export type TSshHostGroupServiceFactory = ReturnType<typeof sshHostGroupServiceFactory>;

export const sshHostGroupServiceFactory = ({
  sshHostDAL,
  sshHostGroupDAL,
  sshHostGroupMembershipDAL,
  sshHostLoginUserDAL,
  sshHostLoginUserMappingDAL,
  userDAL,
  permissionService
}: TSshHostGroupServiceFactoryDep) => {
  const createSshHostGroup = async ({
    projectId,
    name,
    loginMappings,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TCreateSshHostGroupDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.SshHostGroups);

    const newSshHostGroup = await sshHostGroupDAL.transaction(async (tx) => {
      const sshHostGroup = await sshHostGroupDAL.create(
        {
          projectId,
          name // TODO: check that this is unique across the whole org
        },
        tx
      );

      await createSshLoginMappings({
        sshHostGroupId: sshHostGroup.id,
        loginMappings,
        sshHostLoginUserDAL,
        sshHostLoginUserMappingDAL,
        userDAL,
        permissionService,
        projectId,
        actorAuthMethod,
        actorOrgId,
        tx
      });

      const newSshHostGroupWithLoginMappings = await sshHostGroupDAL.findSshHostGroupByIdWithLoginMappings(
        sshHostGroup.id,
        tx
      );
      if (!newSshHostGroupWithLoginMappings) {
        throw new NotFoundError({ message: `SSH host group with ID '${sshHostGroup.id}' not found` });
      }

      return newSshHostGroupWithLoginMappings;
    });

    return newSshHostGroup;
  };

  const updateSshHostGroup = async ({
    sshHostGroupId,
    name,
    loginMappings,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateSshHostGroupDTO) => {
    const sshHostGroup = await sshHostGroupDAL.findById(sshHostGroupId);
    if (!sshHostGroup) throw new NotFoundError({ message: `SSH host group with ID '${sshHostGroupId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: sshHostGroup.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.SshHostGroups);

    const updatedSshHostGroup = await sshHostGroupDAL.transaction(async (tx) => {
      await sshHostGroupDAL.updateById(
        sshHostGroupId,
        {
          name
        },
        tx
      );
      if (loginMappings) {
        await sshHostLoginUserDAL.delete({ sshHostGroupId: sshHostGroup.id }, tx);
        if (loginMappings.length) {
          await createSshLoginMappings({
            sshHostGroupId: sshHostGroup.id,
            loginMappings,
            sshHostLoginUserDAL,
            sshHostLoginUserMappingDAL,
            userDAL,
            permissionService,
            projectId: sshHostGroup.projectId,
            actorAuthMethod,
            actorOrgId,
            tx
          });
        }
      }

      const updatedSshHostGroupWithLoginMappings = await sshHostGroupDAL.findSshHostGroupByIdWithLoginMappings(
        sshHostGroup.id,
        tx
      );
      if (!updatedSshHostGroupWithLoginMappings) {
        throw new NotFoundError({ message: `SSH host group with ID '${sshHostGroup.id}' not found` });
      }

      return updatedSshHostGroupWithLoginMappings;
    });

    return updatedSshHostGroup;
  };

  const getSshHostGroup = async ({
    sshHostGroupId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetSshHostGroupDTO) => {
    const sshHostGroup = await sshHostGroupDAL.findSshHostGroupByIdWithLoginMappings(sshHostGroupId);
    if (!sshHostGroup) throw new NotFoundError({ message: `SSH host group with ID '${sshHostGroupId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: sshHostGroup.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SshHostGroups);

    return sshHostGroup;
  };

  const deleteSshHostGroup = async ({
    sshHostGroupId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteSshHostGroupDTO) => {
    const sshHostGroup = await sshHostGroupDAL.findSshHostGroupByIdWithLoginMappings(sshHostGroupId);
    if (!sshHostGroup) throw new NotFoundError({ message: `SSH host group with ID '${sshHostGroupId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: sshHostGroup.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.SshHostGroups);

    await sshHostGroupDAL.deleteById(sshHostGroupId);

    return sshHostGroup;
  };

  const listSshHostGroupHosts = async ({
    sshHostGroupId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    filter
  }: TListSshHostGroupHostsDTO) => {
    const sshHostGroup = await sshHostGroupDAL.findSshHostGroupByIdWithLoginMappings(sshHostGroupId);
    if (!sshHostGroup) throw new NotFoundError({ message: `SSH host group with ID '${sshHostGroupId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: sshHostGroup.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SshHostGroups);

    const { hosts, totalCount } = await sshHostGroupDAL.findAllSshHostsInGroup({ sshHostGroupId, filter });
    return { sshHostGroup, hosts, totalCount };
  };

  const addHostToSshHostGroup = async ({
    sshHostGroupId,
    hostId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TAddHostToSshHostGroupDTO) => {
    const sshHostGroup = await sshHostGroupDAL.findSshHostGroupByIdWithLoginMappings(sshHostGroupId);
    if (!sshHostGroup) throw new NotFoundError({ message: `SSH host group with ID '${sshHostGroupId}' not found` });

    const sshHost = await sshHostDAL.findSshHostByIdWithLoginMappings(hostId);
    if (!sshHost) {
      throw new NotFoundError({
        message: `SSH host with ID ${hostId} not found`
      });
    }

    if (sshHostGroup.projectId !== sshHost.projectId) {
      throw new NotFoundError({
        message: `SSH host with ID ${hostId} not found in project ${sshHostGroup.projectId}`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: sshHostGroup.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SshHostGroups);
    // TODO: look over permissioning

    await sshHostGroupMembershipDAL.create({ sshHostGroupId, sshHostId: hostId });

    return { sshHostGroup, sshHost };
  };

  const removeHostFromSshHostGroup = async ({
    sshHostGroupId,
    hostId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TRemoveHostFromSshHostGroupDTO) => {
    console.log("removeHostFromSshHostGroup args: ", {
      sshHostGroupId,
      hostId
    });
    const sshHostGroup = await sshHostGroupDAL.findSshHostGroupByIdWithLoginMappings(sshHostGroupId);
    if (!sshHostGroup) throw new NotFoundError({ message: `SSH host group with ID '${sshHostGroupId}' not found` });

    const sshHost = await sshHostDAL.findSshHostByIdWithLoginMappings(hostId);
    if (!sshHost) {
      throw new NotFoundError({
        message: `SSH host with ID ${hostId} not found`
      });
    }

    if (sshHostGroup.projectId !== sshHost.projectId) {
      throw new NotFoundError({
        message: `SSH host with ID ${hostId} not found in project ${sshHostGroup.projectId}`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: sshHostGroup.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.SshHostGroups);
    // TODO: look over permissioning

    const sshHostGroupMembership = await sshHostGroupMembershipDAL.findOne({
      sshHostGroupId,
      sshHostId: hostId
    });

    if (!sshHostGroupMembership) {
      throw new NotFoundError({
        message: `SSH host with ID ${hostId} not found in SSH host group with ID ${sshHostGroupId}`
      });
    }

    console.log("boom: ", {
      sshHostGroupMembership
    });

    await sshHostGroupMembershipDAL.deleteById(sshHostGroupMembership.id);

    return { sshHostGroup, sshHost };
  };

  return {
    createSshHostGroup,
    getSshHostGroup,
    deleteSshHostGroup,
    updateSshHostGroup,
    listSshHostGroupHosts,
    addHostToSshHostGroup,
    removeHostFromSshHostGroup
  };
};
