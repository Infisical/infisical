import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TKmsServiceFactory } from "../kms/kms-service";
import { TUserSecretDALFactory } from "./user-secret-dal";
import {
  TCreateUserSecretDTO,
  TDeleteUserSecretDTO,
  TGetUserSecretDTO,
  TListUserSecretsDTO,
  TListUserSecretsResponse,
  TUpdateUserSecretDTO,
  TUserSecret,
  TUserSecretData,
  TUserSecretPermission,
  TUserSecretResponse,
  UserSecretType
} from "./user-secret-types";

export type TUserSecretServiceFactory = ReturnType<typeof userSecretServiceFactory>;

export const userSecretServiceFactory = (
  userSecretDAL: TUserSecretDALFactory,
  kmsService: TKmsServiceFactory,
  permissionService: TPermissionServiceFactory
) => {
  const validatePermission = async (
    { actor, actorId, actorAuthMethod, actorOrgId }: TUserSecretPermission,
    action: OrgPermissionActions
  ) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    if (!permission.can(action, OrgPermissionSubjects.UserSecret)) {
      throw new ForbiddenRequestError({ message: `You do not have permission to ${action} secrets` });
    }
  };

  const encryptSecretData = (data: string): string => {
    const encryptWithRoot = kmsService.encryptWithRootKey();
    const encrypted = encryptWithRoot(Buffer.from(data));
    return encrypted.toString("base64");
  };

  const decryptSecretData = (data: string): string => {
    const decryptWithRoot = kmsService.decryptWithRootKey();
    const buffer = Buffer.from(data, "base64");
    return decryptWithRoot(buffer).toString();
  };

  // Format response helper
  const formatSecretResponse = (secret: TUserSecret, data: TUserSecretData): TUserSecretResponse => ({
    id: secret.id,
    name: secret.name,
    type: secret.type as UserSecretType,
    data,
    createdAt: secret.createdAt.toISOString(),
    updatedAt: secret.updatedAt.toISOString(),
    createdBy: secret.createdBy
  });

  const listUserSecrets = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    offset,
    limit
  }: TListUserSecretsDTO): Promise<TListUserSecretsResponse> => {
    await validatePermission({ actor, actorId, actorAuthMethod, actorOrgId }, OrgPermissionActions.Read);

    const { secrets, totalCount } = await userSecretDAL.findUserSecrets({ offset, limit });

    const decryptedSecrets = await Promise.all(
      secrets.map(async (secret) => {
        if (!secret.encryptedData) {
          return null;
        }

        logger.info({ secret }, `Decrypting secret`);

        const decryptedData = decryptSecretData(secret.encryptedData);
        return formatSecretResponse(secret, JSON.parse(decryptedData) as TUserSecretData);
      })
    );

    return {
      secrets: decryptedSecrets.filter((s): s is TUserSecretResponse => s !== null),
      totalCount
    };
  };

  const getUserSecretById = async ({
    secretId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetUserSecretDTO): Promise<TUserSecretResponse> => {
    await validatePermission({ actor, actorId, actorAuthMethod, actorOrgId }, OrgPermissionActions.Read);

    const secret = await userSecretDAL.findUserSecretById(secretId);
    if (!secret) {
      throw new NotFoundError({ message: "User secret not found" });
    }

    if (!secret.encryptedData) {
      throw new NotFoundError({ message: "Secret data not found" });
    }

    const decryptedData = decryptSecretData(secret.encryptedData);

    return formatSecretResponse(secret, JSON.parse(decryptedData) as TUserSecretData);
  };

  const createUserSecret = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    name,
    type,
    data
  }: TCreateUserSecretDTO): Promise<TUserSecretResponse> => {
    await validatePermission({ actor, actorId, actorAuthMethod, actorOrgId }, OrgPermissionActions.Create);

    const encryptedSecret = encryptSecretData(JSON.stringify(data));

    const secret = await userSecretDAL.createUserSecret({
      name,
      type,
      encryptedData: encryptedSecret,
      createdBy: actorId,
      iv: "",
      tag: ""
    });

    return formatSecretResponse(secret, data);
  };

  const updateUserSecret = async ({
    secretId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    name,
    data
  }: TUpdateUserSecretDTO): Promise<TUserSecretResponse> => {
    await validatePermission({ actor, actorId, actorAuthMethod, actorOrgId }, OrgPermissionActions.Edit);

    const secret = await userSecretDAL.findUserSecretById(secretId);
    if (!secret) {
      throw new NotFoundError({ message: "User secret not found" });
    }

    // Only include fields that are actually being updated
    const updateData: { name?: string; encryptedData?: string } = {};
    if (name !== undefined) {
      updateData.name = name;
    }
    if (data !== undefined) {
      updateData.encryptedData = encryptSecretData(JSON.stringify(data));
    }

    // Don't make the update call if there's nothing to update
    if (Object.keys(updateData).length === 0) {
      return formatSecretResponse(secret, JSON.parse(decryptSecretData(secret.encryptedData)) as TUserSecretData);
    }

    const updatedSecret = await userSecretDAL.updateUserSecretById(secretId, updateData);
    const decryptedData = decryptSecretData(updatedSecret.encryptedData);

    return formatSecretResponse(updatedSecret, JSON.parse(decryptedData) as TUserSecretData);
  };

  const deleteUserSecret = async ({
    secretId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteUserSecretDTO): Promise<void> => {
    await validatePermission({ actor, actorId, actorAuthMethod, actorOrgId }, OrgPermissionActions.Delete);

    const secret = await userSecretDAL.findUserSecretById(secretId);
    if (!secret) {
      throw new NotFoundError({ message: "User secret not found" });
    }

    await userSecretDAL.deleteById(secretId);
  };

  return {
    listUserSecrets,
    getUserSecretById,
    createUserSecret,
    updateUserSecret,
    deleteUserSecret
  };
};
