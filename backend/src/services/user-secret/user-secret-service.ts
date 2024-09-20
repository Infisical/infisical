import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";

import { TUserSecretDALFactory } from "./user-secret-dal";
import { TCreateUserSecretDTO, TDeleteUserSecretDTO, TGetUserSecretsDTO } from "./user-secret-types";

type TUserSecretServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getUserOrgPermission">;
  userSecretDAL: TUserSecretDALFactory;
};

export type TUserSecretServiceFactory = ReturnType<typeof userSecretServiceFactory>;

export const userSecretServiceFactory = ({ permissionService, userSecretDAL }: TUserSecretServiceFactoryDep) => {
  const getUserSecrets = async ({ actorId, actorAuthMethod, actorOrgId, offset, limit }: TGetUserSecretsDTO) => {
    if (!actorOrgId) throw new BadRequestError({ message: "Failed to create group without organization" });
    const { permission } = await permissionService.getUserOrgPermission(
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    if (!permission) throw new UnauthorizedError({ name: "User not in org" });

    const secrets = await userSecretDAL.find(
      {
        userId: actorId,
        orgId: actorOrgId
      },
      { offset, limit, sort: [["createdAt", "desc"]] }
    );

    const count = await userSecretDAL.countAllUserOrgSecrets({
      orgId: actorOrgId,
      userId: actorId
    });

    return {
      secrets,
      totalCount: count
    };
  };

  const createUserSecret = async ({
    actorId,
    actorAuthMethod,
    actorOrgId,
    encryptedValue,
    hashedHex,
    iv,
    tag,
    name,
    secretType
  }: TCreateUserSecretDTO) => {
    if (!actorOrgId) throw new BadRequestError({ message: "Failed to create group without organization" });
    const { permission } = await permissionService.getUserOrgPermission(
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    if (!permission) throw new UnauthorizedError({ name: "User not in org" });
    // Limit Input ciphertext length to 13000 (equivalent to 10,000 characters of Plaintext)
    if (encryptedValue.length > 13000) {
      throw new BadRequestError({ message: "Shared secret value too long" });
    }

    const newUserSecret = await userSecretDAL.create({
      name,
      encryptedValue,
      hashedHex,
      iv,
      tag,
      userId: actorId,
      orgId: actorOrgId,
      secretType
    });

    return { id: newUserSecret.id };
  };

  const deleteUserSecretById = async (deleteUserSecretInput: TDeleteUserSecretDTO) => {
    const { actorId, actorOrgId, userSecretId, actorAuthMethod } = deleteUserSecretInput;

    if (!actorOrgId) throw new BadRequestError({ message: "Failed to create group without organization" });

    const { permission } = await permissionService.getUserOrgPermission(
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    if (!permission) throw new UnauthorizedError({ name: "User not in org" });

    const deletedUserSecret = await userSecretDAL.deleteById(userSecretId);
    return deletedUserSecret;
  };

  return {
    createUserSecret,
    deleteUserSecretById,
    getUserSecrets
  };
};
