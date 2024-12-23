import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

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
    { actor, actorId, actorAuthMethod, actorOrgId, orgId }: TUserSecretPermission,
    action: OrgPermissionActions
  ) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    if (!permission.can(action, OrgPermissionSubjects.UserSecret)) {
      throw new ForbiddenRequestError({ message: `You do not have permission to ${action} secrets` });
    }
  };

  const encryptSecretData = (data: string): string => {
    const encryptWithRoot = kmsService.encryptWithRootKey();
    return encryptWithRoot(Buffer.from(data)).toString();
  };

  const decryptSecretData = (data: string): string => {
    const decryptWithRoot = kmsService.decryptWithRootKey();
    return decryptWithRoot(Buffer.from(data)).toString();
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

    const decryptedSecrets = await Promise.all(
      secrets.map(async (secret) => {
        if (!secret.encryptedData) {
          return null;
        }

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

    const decryptedData = decryptSecretData(secret.encryptedData);

    return formatSecretResponse(secret, JSON.parse(decryptedData) as TUserSecretData);
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

    const encryptedSecret = encryptSecretData(JSON.stringify(data));

    const secret = await userSecretDAL.createUserSecret({
      name,
      type,
      encryptedData: encryptedSecret,
      createdBy: actorId,
      iv: "",
      tag: "",
      createdAt: new Date(),
      updatedAt: new Date()
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
      updateData.encrypted_data = encryptSecretData(JSON.stringify(updates.data));
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
    actorOrgId,
    orgId
  }: TDeleteUserSecretDTO): Promise<void> => {
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
