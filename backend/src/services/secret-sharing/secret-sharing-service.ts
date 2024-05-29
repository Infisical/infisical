import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { UnauthorizedError } from "@app/lib/errors";

import { TSecretSharingDALFactory } from "./secret-sharing-dal";
import { TCreateSharedSecretDTO, TDeleteSharedSecretDTO, TSharedSecretPermission } from "./secret-sharing-types";

type TSecretSharingServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  secretSharingDAL: TSecretSharingDALFactory;
};

export type TSecretSharingServiceFactory = ReturnType<typeof secretSharingServiceFactory>;

export const secretSharingServiceFactory = ({
  permissionService,
  secretSharingDAL
}: TSecretSharingServiceFactoryDep) => {
  const createSharedSecret = async (createSharedSecretInput: TCreateSharedSecretDTO) => {
    const { actor, actorId, orgId, actorAuthMethod, actorOrgId, name, encryptedValue, iv, tag, hashedHex, expiresAt } =
      createSharedSecretInput;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new UnauthorizedError({ name: "User not in org" });
    const newSharedSecret = await secretSharingDAL.create({
      name,
      encryptedValue,
      iv,
      tag,
      hashedHex,
      expiresAt,
      userId: actorId,
      orgId
    });
    return { id: newSharedSecret.id };
  };

  const getSharedSecrets = async (getSharedSecretsInput: TSharedSecretPermission) => {
    const { actor, actorId, orgId, actorAuthMethod, actorOrgId } = getSharedSecretsInput;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new UnauthorizedError({ name: "User not in org" });
    const userSharedSecrets = await secretSharingDAL.find({ userId: actorId, orgId }, { sort: [["expiresAt", "asc"]] });
    return userSharedSecrets;
  };

  const getActiveSharedSecretByIdAndHashedHex = async (sharedSecretId: string, hashedHex: string) => {
    const sharedSecret = await secretSharingDAL.findOne({ id: sharedSecretId, hashedHex });
    if (sharedSecret && sharedSecret.expiresAt < new Date()) {
      return;
    }
    return sharedSecret;
  };

  const deleteSharedSecretById = async (deleteSharedSecretInput: TDeleteSharedSecretDTO) => {
    const { actor, actorId, orgId, actorAuthMethod, actorOrgId, sharedSecretId } = deleteSharedSecretInput;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new UnauthorizedError({ name: "User not in org" });
    const deletedSharedSecret = await secretSharingDAL.deleteById(sharedSecretId);
    return deletedSharedSecret;
  };

  return {
    createSharedSecret,
    getSharedSecrets,
    deleteSharedSecretById,
    getActiveSharedSecretByIdAndHashedHex
  };
};
