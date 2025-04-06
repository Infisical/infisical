import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSshHostDALFactory } from "@app/ee/services/ssh-host/ssh-host-dal";
import { TSshHostLoginMappingDALFactory } from "@app/ee/services/ssh-host/ssh-host-login-mapping-dal";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TCreateSshHostDTO, TDeleteSshHostDTO, TGetSshHostDTO, TUpdateSshHostDTO } from "./ssh-host-types";

type TSshCertificateAuthorityServiceFactoryDep = {
  sshHostDAL: Pick<
    TSshHostDALFactory,
    "transaction" | "create" | "findById" | "updateById" | "deleteById" | "findOne" | "findSshHostByIdWithLoginMappings"
  >;
  sshHostLoginMappingDAL: Pick<
    TSshHostLoginMappingDALFactory,
    "transaction" | "create" | "findById" | "updateById" | "deleteById" | "findOne" | "insertMany" | "delete"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TSshHostServiceFactory = ReturnType<typeof sshHostServiceFactory>;

/**
 * Checklist:
 * - check permissions across various roles to make sure it makes sense for the SSH hosts
 */

export const sshHostServiceFactory = ({
  sshHostDAL,
  sshHostLoginMappingDAL,
  permissionService
}: TSshCertificateAuthorityServiceFactoryDep) => {
  const createSshHost = async ({
    projectId,
    hostname,
    userCertTtl,
    hostCertTtl,
    loginMappings,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TCreateSshHostDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.SshHosts);

    const newSshHost = await sshHostDAL.transaction(async (tx) => {
      const existingHost = await sshHostDAL.findOne(
        {
          projectId,
          hostname
        },
        tx
      );

      if (existingHost) {
        throw new BadRequestError({
          message: `SSH host with hostname ${hostname} already exists`
        });
      }

      const host = await sshHostDAL.create(
        {
          projectId,
          hostname,
          userCertTtl,
          hostCertTtl
        },
        tx
      );

      await sshHostLoginMappingDAL.insertMany(
        loginMappings.map(({ loginUser, allowedPrincipals }) => ({
          sshHostId: host.id,
          loginUser,
          allowedPrincipals
        })),
        tx
      );

      const newSshHostWithLoginMappings = await sshHostDAL.findSshHostByIdWithLoginMappings(host.id, tx);
      if (!newSshHostWithLoginMappings) {
        throw new NotFoundError({ message: `SSH host with ID '${host.id}' not found` });
      }

      return newSshHostWithLoginMappings;
    });

    return newSshHost;
  };

  const updateSshHost = async ({
    sshHostId,
    hostname,
    userCertTtl,
    hostCertTtl,
    loginMappings,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateSshHostDTO) => {
    const host = await sshHostDAL.findById(sshHostId);
    if (!host) throw new NotFoundError({ message: `SSH host with ID '${sshHostId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: host.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.SshHosts);

    const updatedHost = await sshHostDAL.transaction(async (tx) => {
      await sshHostDAL.updateById(
        sshHostId,
        {
          hostname,
          userCertTtl,
          hostCertTtl
        },
        tx
      );

      if (loginMappings) {
        await sshHostLoginMappingDAL.delete({ sshHostId }, tx);
        if (loginMappings.length) {
          await sshHostLoginMappingDAL.insertMany(
            loginMappings.map(({ loginUser, allowedPrincipals }) => ({
              sshHostId: host.id,
              loginUser,
              allowedPrincipals
            })),
            tx
          );
        }
      }

      const updatedHostWithLoginMappings = await sshHostDAL.findSshHostByIdWithLoginMappings(sshHostId, tx);
      if (!updatedHostWithLoginMappings) {
        throw new NotFoundError({ message: `SSH host with ID '${sshHostId}' not found` });
      }

      return updatedHostWithLoginMappings;
    });

    return updatedHost;
  };

  const deleteSshHost = async ({ sshHostId, actorId, actorAuthMethod, actor, actorOrgId }: TDeleteSshHostDTO) => {
    const host = await sshHostDAL.findSshHostByIdWithLoginMappings(sshHostId);
    if (!host) throw new NotFoundError({ message: `SSH host with ID '${sshHostId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: host.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.SshHosts);

    await sshHostDAL.transaction(async (tx) => {
      await sshHostLoginMappingDAL.delete({ sshHostId }, tx);
      await sshHostDAL.deleteById(sshHostId, tx);
    });

    return host;
  };

  const getSshHost = async ({ sshHostId, actorId, actorAuthMethod, actor, actorOrgId }: TGetSshHostDTO) => {
    const host = await sshHostDAL.findSshHostByIdWithLoginMappings(sshHostId);
    if (!host) {
      throw new NotFoundError({
        message: `SSH host with ID ${sshHostId} not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: host.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SshHosts);

    return host;
  };

  return {
    createSshHost,
    updateSshHost,
    deleteSshHost,
    getSshHost
  };
};
