import { z } from "zod";

import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

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
  // Permission validation helper
  const validatePermission = async (
    { actor, actorId, actorAuthMethod, actorOrgId, orgId }: TUserSecretPermission,
    action: OrgPermissionActions
  ) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    if (!permission.can(action, OrgPermissionSubjects.UserSecret)) {
      throw new ForbiddenRequestError({ message: `You do not have permission to ${action} secrets` });
    }
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
    orgId,
    offset,
    limit
  }: TListUserSecretsDTO): Promise<TListUserSecretsResponse> => {
    await validatePermission({ actor, actorId, actorAuthMethod, actorOrgId, orgId }, OrgPermissionActions.Read);

    const { secrets, totalCount } = await userSecretDAL.findUserSecrets(orgId, { offset, limit });
    const decryptWithRoot = kmsService.decryptWithRootKey();

    const decryptedSecrets = await Promise.all(
      secrets.map(async (secret) => {
        if (!secret.encryptedData) {
          return null;
        }

        const decryptedData = decryptWithRoot(Buffer.from(secret.encryptedData));
        return formatSecretResponse(secret, JSON.parse(decryptedData.toString()) as TUserSecretData);
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
    actorOrgId,
    orgId
  }: TGetUserSecretDTO): Promise<TUserSecretResponse> => {
    await validatePermission({ actor, actorId, actorAuthMethod, actorOrgId, orgId }, OrgPermissionActions.Read);

    const secret = await userSecretDAL.findUserSecretById(secretId);
    if (!secret) {
      throw new NotFoundError({ message: "User secret not found" });
    }

    if (!secret.encryptedData) {
      throw new NotFoundError({ message: "Secret data not found" });
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const decryptedData = decryptWithRoot(Buffer.from(secret.encryptedData, "base64"));

    return formatSecretResponse(secret, JSON.parse(decryptedData.toString()) as TUserSecretData);
  };

  const createUserSecret = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    orgId,
    name,
    type,
    data
  }: TCreateUserSecretDTO): Promise<TUserSecretResponse> => {
    await validatePermission({ actor, actorId, actorAuthMethod, actorOrgId, orgId }, OrgPermissionActions.Create);

    const encryptWithRoot = kmsService.encryptWithRootKey();
    const encryptedSecret = encryptWithRoot(Buffer.from(JSON.stringify(data))).toString("base64");

    const secret = await userSecretDAL.createUserSecret({
      name,
      type,
      encryptedData: encryptedSecret,
      createdBy: actorId,
      iv: "",
      tag: "",
      createdAt: new Date(),
      updatedAt: new Date() // TODO: Unify casing
    });

    return formatSecretResponse(secret, data);
  };

  const updateUserSecret = async ({
    secretId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    orgId,
    data: updates
  }: TUpdateUserSecretDTO): Promise<TUserSecretResponse> => {
    if (!z.string().uuid().safeParse(secretId).success) {
      throw new BadRequestError({ message: "Invalid secret ID format" });
    }

    await validatePermission({ actor, actorId, actorAuthMethod, actorOrgId, orgId }, OrgPermissionActions.Edit);

    const secret = await userSecretDAL.findUserSecretById(secretId);
    if (!secret) {
      throw new NotFoundError({ message: "User secret not found" });
    }

    const updateData: { name?: string; encrypted_data?: string } = {};

    if (updates.name) {
      updateData.name = updates.name;
    }

    if (updates.data) {
      const encryptWithRoot = kmsService.encryptWithRootKey();
      updateData.encrypted_data = encryptWithRoot(Buffer.from(JSON.stringify(updates.data))).toString();
    }

    const updatedSecret = await userSecretDAL.updateUserSecretById(secretId, updateData);
    const decryptWithRoot = kmsService.decryptWithRootKey();
    const decryptedData = decryptWithRoot(Buffer.from(updatedSecret.encryptedData));

    return formatSecretResponse(updatedSecret, JSON.parse(decryptedData.toString()) as TUserSecretData);
  };

  const deleteUserSecret = async ({
    secretId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    orgId
  }: TDeleteUserSecretDTO): Promise<void> => {
    if (!z.string().uuid().safeParse(secretId).success) {
      throw new BadRequestError({ message: "Invalid secret ID format" });
    }

    await validatePermission({ actor, actorId, actorAuthMethod, actorOrgId, orgId }, OrgPermissionActions.Delete);

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
