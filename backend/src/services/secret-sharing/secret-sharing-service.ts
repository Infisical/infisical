import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { SecretSharingAccessType } from "@app/lib/types";

import { TOrgDALFactory } from "../org/org-dal";
import { TSecretSharingDALFactory } from "./secret-sharing-dal";
import {
  TCreatePublicSharedSecretDTO,
  TCreateSharedSecretDTO,
  TDeleteSharedSecretDTO,
  TGetActiveSharedSecretByIdDTO,
  TGetSharedSecretsDTO
} from "./secret-sharing-types";

type TSecretSharingServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  secretSharingDAL: TSecretSharingDALFactory;
  orgDAL: TOrgDALFactory;
};

export type TSecretSharingServiceFactory = ReturnType<typeof secretSharingServiceFactory>;

export const secretSharingServiceFactory = ({
  permissionService,
  secretSharingDAL,
  orgDAL
}: TSecretSharingServiceFactoryDep) => {
  const createSharedSecret = async ({
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId,
    encryptedValue,
    hashedHex,
    iv,
    tag,
    name,
    accessType,
    expiresAt,
    expiresAfterViews
  }: TCreateSharedSecretDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new UnauthorizedError({ name: "User not in org" });

    if (new Date(expiresAt) < new Date()) {
      throw new BadRequestError({ message: "Expiration date cannot be in the past" });
    }

    // Limit Expiry Time to 1 month
    const expiryTime = new Date(expiresAt).getTime();
    const currentTime = new Date().getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (expiryTime - currentTime > thirtyDays) {
      throw new BadRequestError({ message: "Expiration date cannot be more than 30 days" });
    }

    // Limit Input ciphertext length to 13000 (equivalent to 10,000 characters of Plaintext)
    if (encryptedValue.length > 13000) {
      throw new BadRequestError({ message: "Shared secret value too long" });
    }

    const newSharedSecret = await secretSharingDAL.create({
      name,
      encryptedValue,
      hashedHex,
      iv,
      tag,
      expiresAt: new Date(expiresAt),
      expiresAfterViews,
      userId: actorId,
      orgId,
      accessType
    });

    return { id: newSharedSecret.id };
  };

  const createPublicSharedSecret = async ({
    encryptedValue,
    hashedHex,
    iv,
    tag,
    expiresAt,
    expiresAfterViews,
    accessType
  }: TCreatePublicSharedSecretDTO) => {
    if (new Date(expiresAt) < new Date()) {
      throw new BadRequestError({ message: "Expiration date cannot be in the past" });
    }

    // Limit Expiry Time to 1 month
    const expiryTime = new Date(expiresAt).getTime();
    const currentTime = new Date().getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (expiryTime - currentTime > thirtyDays) {
      throw new BadRequestError({ message: "Expiration date cannot exceed more than 30 days" });
    }

    // Limit Input ciphertext length to 13000 (equivalent to 10,000 characters of Plaintext)
    if (encryptedValue.length > 13000) {
      throw new BadRequestError({ message: "Shared secret value too long" });
    }

    const newSharedSecret = await secretSharingDAL.create({
      encryptedValue,
      hashedHex,
      iv,
      tag,
      expiresAt: new Date(expiresAt),
      expiresAfterViews,
      accessType
    });
    return { id: newSharedSecret.id };
  };

  const getSharedSecrets = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    offset,
    limit
  }: TGetSharedSecretsDTO) => {
    if (!actorOrgId) throw new BadRequestError({ message: "Failed to create group without organization" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    if (!permission) throw new UnauthorizedError({ name: "User not in org" });

    const secrets = await secretSharingDAL.find(
      {
        userId: actorId,
        orgId: actorOrgId
      },
      { offset, limit, sort: [["createdAt", "desc"]] }
    );

    const count = await secretSharingDAL.countAllUserOrgSharedSecrets({
      orgId: actorOrgId,
      userId: actorId
    });

    return {
      secrets,
      totalCount: count
    };
  };

  const getActiveSharedSecretById = async ({ sharedSecretId, hashedHex, orgId }: TGetActiveSharedSecretByIdDTO) => {
    const sharedSecret = await secretSharingDAL.findOne({
      id: sharedSecretId,
      hashedHex
    });
    if (!sharedSecret)
      throw new NotFoundError({
        message: "Shared secret not found"
      });

    const { accessType, expiresAt, expiresAfterViews } = sharedSecret;

    const orgName = sharedSecret.orgId ? (await orgDAL.findOrgById(sharedSecret.orgId))?.name : "";

    if (accessType === SecretSharingAccessType.Organization && orgId !== sharedSecret.orgId)
      throw new UnauthorizedError();

    if (expiresAt !== null && expiresAt < new Date()) {
      // check lifetime expiry
      await secretSharingDAL.softDeleteById(sharedSecretId);
      throw new ForbiddenRequestError({
        message: "Access denied: Secret has expired by lifetime"
      });
    }

    if (expiresAfterViews !== null && expiresAfterViews === 0) {
      // check view count expiry
      await secretSharingDAL.softDeleteById(sharedSecretId);
      throw new ForbiddenRequestError({
        message: "Access denied: Secret has expired by view count"
      });
    }

    if (expiresAfterViews) {
      // decrement view count if view count expiry set
      await secretSharingDAL.updateById(sharedSecretId, { $decr: { expiresAfterViews: 1 } });
    }

    await secretSharingDAL.updateById(sharedSecretId, {
      lastViewedAt: new Date()
    });

    return {
      ...sharedSecret,
      orgName:
        sharedSecret.accessType === SecretSharingAccessType.Organization && orgId === sharedSecret.orgId
          ? orgName
          : undefined
    };
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
    createPublicSharedSecret,
    getSharedSecrets,
    deleteSharedSecretById,
    getActiveSharedSecretById
  };
};
