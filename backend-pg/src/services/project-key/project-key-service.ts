import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";

import { TProjectMembershipDalFactory } from "../project-membership/project-membership-dal";
import { TProjectKeyDalFactory } from "./project-key-dal";
import { TGetLatestProjectKeyDTO, TUploadProjectKeyDTO } from "./project-key-types";

type TProjectKeyServiceFactoryDep = {
  permissionService: TPermissionServiceFactory;
  projectKeyDal: TProjectKeyDalFactory;
  projectMembershipDal: TProjectMembershipDalFactory;
};

export type TProjectKeyServiceFactory = ReturnType<typeof projectKeyServiceFactory>;

export const projectKeyServiceFactory = ({
  projectKeyDal,
  projectMembershipDal,
  permissionService
}: TProjectKeyServiceFactoryDep) => {
  const uploadProjectKeys = async ({
    receiverId,
    actor,
    actorId,
    projectId,
    nonce,
    encryptedKey
  }: TUploadProjectKeyDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.Member
    );

    const receiverMembership = await projectMembershipDal.findOne({
      userId: receiverId,
      projectId
    });
    if (!receiverMembership)
      throw new BadRequestError({
        message: "Failed to validate receiver membership",
        name: "Upload project keys"
      });

    await projectKeyDal.create({ projectId, receiverId, encryptedKey, nonce, senderId: actorId });
  };

  const getLatestProjectKey = async ({ actorId, projectId, actor }: TGetLatestProjectKeyDTO) => {
    await permissionService.getProjectPermission(actor, actorId, projectId);
    const latestKey = await projectKeyDal.findLatestProjectKey(actorId, projectId);
    return latestKey;
  };

  const getProjectPublicKeys = async ({ actor, actorId, projectId }: TGetLatestProjectKeyDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Member
    );
    return projectKeyDal.findAllProjectUserPubKeys(projectId);
  };

  return {
    uploadProjectKeys,
    getProjectPublicKeys,
    getLatestProjectKey
  };
};
