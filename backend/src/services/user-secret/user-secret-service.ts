import crypto from "node:crypto";

import { z } from "zod";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { TKmsServiceFactory } from "../kms/kms-service";
import { TUserSecretDALFactory } from "./user-secret-dal";
import { TCreateUserSecretDTO, TDeleteUserSecretDTO, TListUserSecretsDTO } from "./user-secret-types";

type TUserSecretServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  userSecretDAL: TUserSecretDALFactory;
  kmsService: TKmsServiceFactory;
};

export type TUserSecretServiceFactory = ReturnType<typeof userSecretServiceFactory>;

const isUuidV4 = (uuid: string) => z.string().uuid().safeParse(uuid).success;

export const userSecretServiceFactory = ({
  permissionService,
  userSecretDAL,
  kmsService
}: TUserSecretServiceFactoryDep) => {
  const listUserSecrets = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    offset,
    limit
  }: TListUserSecretsDTO) => {
    if (!actorOrgId) throw new ForbiddenRequestError();

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    if (!permission) {
      throw new ForbiddenRequestError({
        name: "User does not belong to the specified organization"
      });
    }

    const secrets = await userSecretDAL.listUserSecrets(
      {
        organization_id: actorOrgId,
        created_by: actorId
      },
      { offset, limit, sort: [["createdAt", "desc"]] }
    );

    return secrets;
  };

  const createUserSecret = async ({
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId,
    name,
    type,
    secretValue,
    keyEncoding,
    algorithm
  }: TCreateUserSecretDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    if (!permission) {
      throw new ForbiddenRequestError({
        name: "User is not a part of the specified organization"
      });
    }

    if (secretValue.length > 10_000) {
      throw new BadRequestError({ message: "Secret value too long" });
    }

    const encryptWithRoot = kmsService.encryptWithRootKey();
    const encryptedSecret = encryptWithRoot(Buffer.from(secretValue));

    const newUserSecret = await userSecretDAL.createUserSecret({
      organization_id: orgId,
      created_by: actorId,
      name,
      type,
      encrypted_data: encryptedSecret,
      key_encoding: keyEncoding,
      algorithm,
      iv: null, // Using KMS encryption instead
      tag: null // Using KMS encryption instead
    });

    return newUserSecret;
  };

  const getUserSecretById = async (secretId: string, { actor, actorId, orgId, actorAuthMethod, actorOrgId }) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    if (!permission) {
      throw new ForbiddenRequestError({
        name: "User does not belong to the specified organization"
      });
    }

    const secret = isUuidV4(secretId) ? await userSecretDAL.getUserSecretById(secretId) : null;

    if (!secret) {
      throw new NotFoundError({
        message: `User secret with ID '${secretId}' not found`
      });
    }

    if (secret.organization_id !== orgId) {
      throw new ForbiddenRequestError({
        message: "Access denied to user secret"
      });
    }

    let decryptedSecretValue: Buffer | undefined;
    if (secret.encrypted_data) {
      const decryptWithRoot = kmsService.decryptWithRootKey();
      decryptedSecretValue = decryptWithRoot(secret.encrypted_data);
    }

    return {
      ...secret,
      ...(decryptedSecretValue && {
        secretValue: Buffer.from(decryptedSecretValue).toString()
      })
    };
  };

  const deleteUserSecret = async ({
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId,
    secretId
  }: TDeleteUserSecretDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);

    if (!permission) {
      throw new ForbiddenRequestError({
        name: "User does not belong to the specified organization"
      });
    }

    const secret = isUuidV4(secretId) ? await userSecretDAL.getUserSecretById(secretId) : null;

    if (!secret) {
      throw new NotFoundError({
        message: `User secret with ID '${secretId}' not found`
      });
    }

    if (secret.organization_id !== orgId) {
      throw new ForbiddenRequestError({
        message: "User does not have permission to delete this secret"
      });
    }

    const deletedSecret = await userSecretDAL.deleteUserSecret(secretId);
    return deletedSecret;
  };

  return {
    listUserSecrets,
    getUserSecretById,
    createUserSecret,
    deleteUserSecret
  };
};
