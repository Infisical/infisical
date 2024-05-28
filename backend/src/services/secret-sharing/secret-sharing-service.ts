import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";

import { TSecretSharingDALFactory } from "./secret-sharing-dal";
import { TCreateSharedSecretDTO, TDeleteSharedSecretDTO, TSharedSecretPermission } from "./secret-sharing-types";

type TSecretSharingServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretSharingDAL: TSecretSharingDALFactory;
};

export type TSecretSharingServiceFactory = ReturnType<typeof secretSharingServiceFactory>;

export const secretSharingServiceFactory = ({
  permissionService,
  secretSharingDAL
}: TSecretSharingServiceFactoryDep) => {
  const createSharedSecret = async (createSharedSecretInput: TCreateSharedSecretDTO) => {
    const { actor, actorId, projectId, actorAuthMethod, actorOrgId, name, signedValue, expiresAt } =
      createSharedSecretInput;
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.SecretSharing);
    const newSharedSecret = await secretSharingDAL.create({
      name,
      signedValue,
      expiresAt,
      userId: actorId
    });
    return { id: newSharedSecret.id };
  };

  const getSharedSecrets = async (getSharedSecretsInput: TSharedSecretPermission) => {
    const { actor, actorId, projectId, actorAuthMethod, actorOrgId } = getSharedSecretsInput;
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretSharing);
    const userSharedSecrets = await secretSharingDAL.find({ userId: actorId }, { sort: [["expiresAt", "asc"]] });
    return userSharedSecrets;
  };

  const getActiveSharedSecretById = async (sharedSecretId: string) => {
    const sharedSecret = await secretSharingDAL.findById(sharedSecretId);
    if (sharedSecret && sharedSecret.expiresAt < new Date()) {
      return;
    }
    return sharedSecret;
  };

  const deleteSharedSecretById = async (deleteSharedSecretInput: TDeleteSharedSecretDTO) => {
    const { actor, actorId, projectId, actorAuthMethod, actorOrgId, sharedSecretId } = deleteSharedSecretInput;
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.SecretSharing);
    const deletedSharedSecret = await secretSharingDAL.deleteById(sharedSecretId);
    return deletedSharedSecret;
  };

  return {
    createSharedSecret,
    getSharedSecrets,
    deleteSharedSecretById,
    getActiveSharedSecretById
  };
};
