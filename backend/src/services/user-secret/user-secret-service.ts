import { z } from "zod";

import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TUserSecretDALFactory } from "./user-secret-dal";
import {
  TCreateUserSecretDTO,
  TDeleteUserSecretDTO,
  TGetUserSecretDTO,
  TListUserSecretsDTO,
  TListUserSecretsResponse,
  TUpdateUserSecretDTO,
  TUserSecretData,
  TUserSecretResponse,
  UserSecretType
} from "./user-secret-types";

export type TUserSecretServiceFactory = ReturnType<typeof userSecretServiceFactory>;

export const userSecretServiceFactory = (
  userSecretDAL: TUserSecretDALFactory,
  kmsService: TKmsServiceFactory,
  permissionService: TPermissionServiceFactory
) => {
  const listUserSecrets = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    orgId,
    offset,
    limit
  }: TListUserSecretsDTO): Promise<TListUserSecretsResponse> => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    if (!permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.UserSecret)) {
      throw new ForbiddenRequestError({ message: "You do not have permission to read secrets" });
    }

    const { secrets, totalCount } = await userSecretDAL.findUserSecrets(orgId, { offset, limit });

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    const decryptedSecrets = await Promise.all(
      secrets.map(async (secret) => {
        if (!secret.encrypted_data) {
          return null;
        }

        // TODO: Unify decryption logic, access checks
        const cipherTextBuffer = Buffer.from(secret.encrypted_data, "base64");

        const decryptedData = decryptor({
          cipherTextBlob: cipherTextBuffer
        });

        return {
          id: secret.id,
          organizationId: secret.organization_id,
          name: secret.name,
          type: secret.type as UserSecretType,
          data: JSON.parse(decryptedData.toString("utf-8")) as TUserSecretData,
          createdAt: secret.createdAt.toISOString(),
          updatedAt: secret.updatedAt.toISOString(),
          createdBy: secret.created_by
        };
      })
    );

    return {
      secrets: decryptedSecrets.filter((secret): secret is TUserSecretResponse => secret !== null),
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
    // Validate UUID
    if (!z.string().uuid().safeParse(secretId).success) {
      throw new BadRequestError({ message: "Invalid secret ID format" });
    }

    // Check org-level read permission
    await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    // Check if actor has required permission
    if (!permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.UserSecret)) {
      throw new ForbiddenRequestError({ message: "You do not have permission to read secrets" });
    }

    const secret = await userSecretDAL.findUserSecretById(secretId);
    if (!secret) {
      throw new NotFoundError({ message: "User secret not found" });
    }

    if (secret.organization_id !== orgId) {
      throw new ForbiddenRequestError({ message: "Access denied to this secret" });
    }

    if (!secret.encrypted_data) {
      throw new NotFoundError({ message: "Secret data not found" });
    }

    // Create cipher pair for decryption
    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    // Decrypt data
    const decryptedData = decryptor({
      cipherTextBlob: Buffer.from(secret.encrypted_data, "base64")
    });

    return {
      id: secret.id,
      organizationId: secret.organization_id,
      name: secret.name,
      type: secret.type as UserSecretType,
      data: JSON.parse(decryptedData.toString("utf-8")) as TUserSecretData,
      createdAt: secret.createdAt.toISOString(),
      updatedAt: secret.updatedAt.toISOString(),
      createdBy: secret.created_by
    };
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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    if (!permission.can(OrgPermissionActions.Create, OrgPermissionSubjects.UserSecret)) {
      throw new ForbiddenRequestError({ message: "You do not have permission to create secrets" });
    }

    const encryptWithRoot = kmsService.encryptWithRootKey();
    const encryptedSecret = encryptWithRoot(Buffer.from(JSON.stringify(data), "utf-8")).toString("base64");

    const secret = await userSecretDAL.createUserSecret({
      organization_id: orgId,
      name,
      type,
      encrypted_data: encryptedSecret,
      created_by: actorId,
      createdAt: new Date(),
      updatedAt: new Date(),
      iv: "", // As we are using root key, we don't need to store iv, tag, algorithm, key_encoding for now
      tag: "",
      algorithm: "",
      key_encoding: "" // TODO: Possibly remove
    });

    return {
      id: secret.id,
      organizationId: secret.organization_id,
      name: secret.name,
      type: secret.type as UserSecretType,
      data,
      createdAt: secret.createdAt.toISOString(),
      updatedAt: secret.updatedAt.toISOString(),
      createdBy: secret.created_by
    };
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
    // Validate UUID
    if (!z.string().uuid().safeParse(secretId).success) {
      throw new BadRequestError({ message: "Invalid secret ID format" });
    }

    // Check org-level write permission
    await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    if (!permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.UserSecret)) {
      throw new ForbiddenRequestError({ message: "You do not have permission to update secrets" });
    }

    const secret = await userSecretDAL.findUserSecretById(secretId);
    if (!secret) {
      throw new NotFoundError({ message: "User secret not found" });
    }

    if (secret.organization_id !== orgId) {
      throw new ForbiddenRequestError({ message: "Access denied to this secret" });
    }

    const updateData: { name?: string; data?: string } = {};

    if (updates.name) {
      updateData.name = updates.name;
    }

    if (updates.data) {
      const { encryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId
      });

      const { cipherTextBlob } = encryptor({
        plainText: Buffer.from(JSON.stringify(updates.data), "utf-8")
      });

      // Convert Buffer to base64 for storage
      updateData.data = cipherTextBlob.toString("base64");
    }

    const updatedSecret = await userSecretDAL.updateUserSecretById(secretId, updateData);

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    // Convert base64 to Buffer for decryption
    const cipherTextBuffer = Buffer.from(updatedSecret.encrypted_data, "base64");

    const decryptedData = decryptor({
      cipherTextBlob: cipherTextBuffer
    });

    return {
      id: updatedSecret.id,
      organizationId: updatedSecret.organization_id,
      name: updatedSecret.name,
      type: updatedSecret.type as UserSecretType,
      data: JSON.parse(decryptedData.toString("utf-8")) as TUserSecretData,
      createdAt: updatedSecret.createdAt.toISOString(),
      updatedAt: updatedSecret.updatedAt.toISOString(),
      createdBy: updatedSecret.created_by
    };
  };

  const deleteUserSecret = async ({
    secretId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    orgId
  }: TDeleteUserSecretDTO): Promise<void> => {
    // Validate UUID
    if (!z.string().uuid().safeParse(secretId).success) {
      throw new BadRequestError({ message: "Invalid secret ID format" });
    }

    // Check org-level write permission
    await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    if (!permission.can(OrgPermissionActions.Delete, OrgPermissionSubjects.UserSecret)) {
      throw new ForbiddenRequestError({ message: "You do not have permission to delete secrets" });
    }

    const secret = await userSecretDAL.findUserSecretById(secretId);
    if (!secret) {
      throw new NotFoundError({ message: "User secret not found" });
    }

    if (secret.organization_id !== orgId) {
      throw new ForbiddenRequestError({ message: "Access denied to this secret" });
    }

    await userSecretDAL.softDeleteById(secretId);
  };

  return {
    listUserSecrets,
    getUserSecretById,
    createUserSecret,
    updateUserSecret,
    deleteUserSecret
  };
};
