import { AccessScope } from "@app/db/schemas";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  TProjectPermissionService
} from "@app/domains/platform/projects/ce/module";
import { BadRequestError } from "@app/lib/errors";

import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { TProjectKeyDALFactory } from "./project-key-dal";
import { TGetLatestProjectKeyDTO, TUploadProjectKeyDTO } from "./project-key-types";

type TProjectKeyServiceFactoryDep = {
  projectPermissionService: TProjectPermissionService;
  projectKeyDAL: TProjectKeyDALFactory;
  membershipUserDAL: TMembershipUserDALFactory;
};

export type TProjectKeyServiceFactory = ReturnType<typeof projectKeyServiceFactory>;

export const projectKeyServiceFactory = ({
  projectKeyDAL,
  membershipUserDAL,
  projectPermissionService
}: TProjectKeyServiceFactoryDep) => {
  const uploadProjectKeys = async ({ receiverId, actor, projectId, nonce, encryptedKey }: TUploadProjectKeyDTO) => {
    const permission = await projectPermissionService.getProjectPermission({ actor, projectId });
    permission.assert({ action: ProjectPermissionMemberActions.Edit, subject: ProjectPermissionSub.Member });

    const receiverMembership = await membershipUserDAL.findOne({
      actorUserId: receiverId,
      scopeProjectId: projectId,
      scope: AccessScope.Project
    });
    if (!receiverMembership)
      throw new BadRequestError({
        message: "Failed to validate receiver membership",
        name: "Upload project keys"
      });

    await projectKeyDAL.create({ projectId, receiverId, encryptedKey, nonce, senderId: actor.principal.id });
  };

  const getLatestProjectKey = async ({ projectId, actor }: TGetLatestProjectKeyDTO) => {
    await projectPermissionService.getProjectPermission({ actor, projectId });
    const latestKey = await projectKeyDAL.findLatestProjectKey(actor.principal.id, projectId);
    return latestKey;
  };

  const getProjectPublicKeys = async ({ actor, projectId }: TGetLatestProjectKeyDTO) => {
    const permission = await projectPermissionService.getProjectPermission({ actor, projectId });
    permission.assert({ action: ProjectPermissionMemberActions.Read, subject: ProjectPermissionSub.Member });
    return projectKeyDAL.findAllProjectUserPubKeys(projectId);
  };

  return {
    uploadProjectKeys,
    getProjectPublicKeys,
    getLatestProjectKey
  };
};
