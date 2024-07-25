import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { SecretSharingAccessType } from "@app/lib/types";

import { TOrgDALFactory } from "../org/org-dal";
import { TSecretSharingDALFactory } from "./secret-sharing-dal";
import {
  TCreatePublicSharedSecretDTO,
  TCreateSharedSecretDTO,
  TDeleteSharedSecretDTO,
  TSharedSecretPermission
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
  const createSharedSecret = async (createSharedSecretInput: TCreateSharedSecretDTO) => {
    const {
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      encryptedValue,
      iv,
      tag,
      accessType,
      hashedHex,
      expiresAt,
      expiresAfterViews
    } = createSharedSecretInput;
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
      encryptedValue,
      iv,
      tag,
      hashedHex,
      expiresAt,
      expiresAfterViews,
      userId: actorId,
      orgId,
      accessType
    });
    return { id: newSharedSecret.id };
  };

  const createPublicSharedSecret = async (createSharedSecretInput: TCreatePublicSharedSecretDTO) => {
    const { encryptedValue, iv, tag, hashedHex, expiresAt, expiresAfterViews, accessType } = createSharedSecretInput;
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
      iv,
      tag,
      hashedHex,
      expiresAt,
      expiresAfterViews,
      accessType
    });
    return { id: newSharedSecret.id };
  };

  const getSharedSecrets = async (getSharedSecretsInput: TSharedSecretPermission) => {
    const { actor, actorId, orgId, actorAuthMethod, actorOrgId } = getSharedSecretsInput;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new UnauthorizedError({ name: "User not in org" });
    const userSharedSecrets = await secretSharingDAL.findActiveSharedSecrets({ userId: actorId, orgId });
    return userSharedSecrets;
  };

  const getActiveSharedSecretByIdAndHashedHex = async (sharedSecretId: string, hashedHex: string, orgId?: string) => {
    const sharedSecret = await secretSharingDAL.findOne({ id: sharedSecretId, hashedHex });
    if (!sharedSecret) return;

    const orgName = sharedSecret.orgId ? (await orgDAL.findOrgById(sharedSecret.orgId))?.name : "";
    // Support organization level access for secret sharing
    if (sharedSecret.accessType === SecretSharingAccessType.Organization && orgId !== sharedSecret.orgId) {
      return {
        ...sharedSecret,
        encryptedValue: "",
        iv: "",
        tag: "",
        orgName
      };
    }
    if (sharedSecret.expiresAt && sharedSecret.expiresAt < new Date()) {
      return;
    }
    if (sharedSecret.expiresAfterViews != null && sharedSecret.expiresAfterViews >= 0) {
      if (sharedSecret.expiresAfterViews === 0) {
        await secretSharingDAL.softDeleteById(sharedSecretId);
        return;
      }
      await secretSharingDAL.updateById(sharedSecretId, { $decr: { expiresAfterViews: 1 } });
    }
    if (sharedSecret.accessType === SecretSharingAccessType.Organization && orgId === sharedSecret.orgId) {
      return { ...sharedSecret, orgName };
    }
    return { ...sharedSecret, orgName: undefined };
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
    getActiveSharedSecretByIdAndHashedHex
  };
};
