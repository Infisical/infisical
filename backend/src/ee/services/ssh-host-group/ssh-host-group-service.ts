import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, SubscriptionProductCategory } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSshHostDALFactory } from "@app/ee/services/ssh-host/ssh-host-dal";
import { TSshHostLoginUserMappingDALFactory } from "@app/ee/services/ssh-host/ssh-host-login-user-mapping-dal";
import { TSshHostLoginUserDALFactory } from "@app/ee/services/ssh-host/ssh-login-user-dal";
import { TSshHostGroupDALFactory } from "@app/ee/services/ssh-host-group/ssh-host-group-dal";
import { TSshHostGroupMembershipDALFactory } from "@app/ee/services/ssh-host-group/ssh-host-group-membership-dal";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TGroupDALFactory } from "../group/group-dal";
import { TLicenseServiceFactory } from "../license/license-service";
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
  projectDAL: Pick<TProjectDALFactory, "findById" | "find">;
  sshHostDAL: Pick<TSshHostDALFactory, "findSshHostByIdWithLoginMappings">;
  sshHostGroupDAL: Pick<
    TSshHostGroupDALFactory,
    | "create"
    | "updateById"
    | "findById"
    | "deleteById"
    | "transaction"
    | "findSshHostGroupByIdWithLoginMappings"
    | "findAllSshHostsInGroup"
    | "findOne"
    | "find"
  >;
  sshHostGroupMembershipDAL: Pick<TSshHostGroupMembershipDALFactory, "create" | "deleteById" | "findOne">;
  sshHostLoginUserDAL: Pick<TSshHostLoginUserDALFactory, "create" | "transaction" | "delete">;
  sshHostLoginUserMappingDAL: Pick<TSshHostLoginUserMappingDALFactory, "insertMany">;
  userDAL: Pick<TUserDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "checkGroupProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  groupDAL: Pick<TGroupDALFactory, "findGroupsByProjectId">;
};

export type TSshHostGroupServiceFactory = ReturnType<typeof sshHostGroupServiceFactory>;

export const sshHostGroupServiceFactory = ({
  projectDAL,
  sshHostDAL,
  sshHostGroupDAL,
  sshHostGroupMembershipDAL,
  sshHostLoginUserDAL,
  sshHostLoginUserMappingDAL,
  userDAL,
  permissionService,
  licenseService,
  groupDAL
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

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.get(SubscriptionProductCategory.Pam, "sshHostGroups"))
      throw new BadRequestError({
        message: "Failed to create SSH host group due to plan restriction. Upgrade plan to create group."
      });

    const newSshHostGroup = await sshHostGroupDAL.transaction(async (tx) => {
      // (dangtony98): room to optimize check to ensure that
      // the SSH host group name is unique across the whole org
      const project = await projectDAL.findById(projectId, tx);
      if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
      const projects = await projectDAL.find(
        {
          orgId: project.orgId
        },
        { tx }
      );

      const existingSshHostGroup = await sshHostGroupDAL.find(
        {
          name,
          $in: {
            projectId: projects.map((p) => p.id)
          }
        },
        { tx }
      );

      if (existingSshHostGroup.length) {
        throw new BadRequestError({
          message: `SSH host group with name '${name}' already exists in the organization`
        });
      }

      const sshHostGroup = await sshHostGroupDAL.create(
        {
          projectId,
          name
        },
        tx
      );

      await createSshLoginMappings({
        sshHostGroupId: sshHostGroup.id,
        loginMappings,
        sshHostLoginUserDAL,
        sshHostLoginUserMappingDAL,
        groupDAL,
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

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.get(SubscriptionProductCategory.Pam, "sshHostGroups"))
      throw new BadRequestError({
        message: "Failed to update SSH host group due to plan restriction. Upgrade plan to update group."
      });

    const updatedSshHostGroup = await sshHostGroupDAL.transaction(async (tx) => {
      if (name && name !== sshHostGroup.name) {
        // (dangtony98): room to optimize check to ensure that
        // the SSH host group name is unique across the whole org
        const project = await projectDAL.findById(sshHostGroup.projectId, tx);
        if (!project) throw new NotFoundError({ message: `Project with ID '${sshHostGroup.projectId}' not found` });
        const projects = await projectDAL.find(
          {
            orgId: project.orgId
          },
          { tx }
        );

        const existingSshHostGroup = await sshHostGroupDAL.find(
          {
            name,
            $in: {
              projectId: projects.map((p) => p.id)
            }
          },
          { tx }
        );

        if (existingSshHostGroup.length) {
          throw new BadRequestError({
            message: `SSH host group with name '${name}' already exists in the organization`
          });
        }
        await sshHostGroupDAL.updateById(
          sshHostGroupId,
          {
            name
          },
          tx
        );
      }

      if (loginMappings) {
        await sshHostLoginUserDAL.delete({ sshHostGroupId: sshHostGroup.id }, tx);
        if (loginMappings.length) {
          await createSshLoginMappings({
            sshHostGroupId: sshHostGroup.id,
            loginMappings,
            sshHostLoginUserDAL,
            sshHostLoginUserMappingDAL,
            groupDAL,
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
      throw new BadRequestError({
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
    const sshHostGroup = await sshHostGroupDAL.findSshHostGroupByIdWithLoginMappings(sshHostGroupId);
    if (!sshHostGroup) throw new NotFoundError({ message: `SSH host group with ID '${sshHostGroupId}' not found` });

    const sshHost = await sshHostDAL.findSshHostByIdWithLoginMappings(hostId);
    if (!sshHost) {
      throw new NotFoundError({
        message: `SSH host with ID ${hostId} not found`
      });
    }

    if (sshHostGroup.projectId !== sshHost.projectId) {
      throw new BadRequestError({
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

    const sshHostGroupMembership = await sshHostGroupMembershipDAL.findOne({
      sshHostGroupId,
      sshHostId: hostId
    });

    if (!sshHostGroupMembership) {
      throw new NotFoundError({
        message: `SSH host with ID ${hostId} not found in SSH host group with ID ${sshHostGroupId}`
      });
    }

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
