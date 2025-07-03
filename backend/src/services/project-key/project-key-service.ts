import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionMemberActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";

import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TProjectKeyDALFactory } from "./project-key-dal";
import { TGetLatestProjectKeyDTO, TUploadProjectKeyDTO } from "./project-key-types";

type TProjectKeyServiceFactoryDep = {
  permissionService: TPermissionServiceFactory;
  projectKeyDAL: TProjectKeyDALFactory;
  projectMembershipDAL: TProjectMembershipDALFactory;
};

export type TProjectKeyServiceFactory = ReturnType<typeof projectKeyServiceFactory>;

export const projectKeyServiceFactory = ({
  projectKeyDAL,
  projectMembershipDAL,
  permissionService
}: TProjectKeyServiceFactoryDep) => {
  const uploadProjectKeys = async ({
    receiverId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    nonce,
    encryptedKey
  }: TUploadProjectKeyDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member);

    const receiverMembership = await projectMembershipDAL.findOne({
      userId: receiverId,
      projectId
    });
    if (!receiverMembership)
      throw new BadRequestError({
        message: "Failed to validate receiver membership",
        name: "Upload project keys"
      });

    await projectKeyDAL.create({ projectId, receiverId, encryptedKey, nonce, senderId: actorId });
  };

  const getLatestProjectKey = async ({
    actorId,
    projectId,
    actor,
    actorOrgId,
    actorAuthMethod
  }: TGetLatestProjectKeyDTO) => {
    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });
    const latestKey = await projectKeyDAL.findLatestProjectKey(actorId, projectId);
    return latestKey;
  };

  const getProjectPublicKeys = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TGetLatestProjectKeyDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);
    return projectKeyDAL.findAllProjectUserPubKeys(projectId);
  };

  return {
    uploadProjectKeys,
    getProjectPublicKeys,
    getLatestProjectKey
  };
};
