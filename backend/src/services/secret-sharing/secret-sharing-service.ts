import crypto from "node:crypto";

import bcrypt from "bcrypt";
import { z } from "zod";

import { TSecretSharing } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { SecretSharingAccessType } from "@app/lib/types";

import { TKmsServiceFactory } from "../kms/kms-service";
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
  kmsService: TKmsServiceFactory;
};

export type TSecretSharingServiceFactory = ReturnType<typeof secretSharingServiceFactory>;

const isUuidV4 = (uuid: string) => z.string().uuid().safeParse(uuid).success;

export const secretSharingServiceFactory = ({
  permissionService,
  secretSharingDAL,
  orgDAL,
  kmsService
}: TSecretSharingServiceFactoryDep) => {
  const createSharedSecret = async ({
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId,
    secretValue,
    name,
    password,
    accessType,
    expiresAt,
    expiresAfterViews
  }: TCreateSharedSecretDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new ForbiddenRequestError({ name: "User is not a part of the specified organization" });

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

    if (secretValue.length > 10_000) {
      throw new BadRequestError({ message: "Shared secret value too long" });
    }

    const encryptWithRoot = kmsService.encryptWithRootKey();

    const encryptedSecret = encryptWithRoot(Buffer.from(secretValue));

    const id = crypto.randomBytes(32).toString("hex");
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    const newSharedSecret = await secretSharingDAL.create({
      identifier: id,
      iv: null,
      tag: null,
      encryptedValue: null,
      encryptedSecret,
      name,
      password: hashedPassword,
      expiresAt: new Date(expiresAt),
      expiresAfterViews,
      userId: actorId,
      orgId,
      accessType
    });

    const idToReturn = `${Buffer.from(newSharedSecret.identifier!, "hex").toString("base64url")}`;

    return { id: idToReturn };
  };

  const createPublicSharedSecret = async ({
    password,
    secretValue,
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

    const encryptWithRoot = kmsService.encryptWithRootKey();
    const encryptedSecret = encryptWithRoot(Buffer.from(secretValue));

    const id = crypto.randomBytes(32).toString("hex");
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    const newSharedSecret = await secretSharingDAL.create({
      identifier: id,
      encryptedValue: null,
      iv: null,
      tag: null,
      encryptedSecret,
      password: hashedPassword,
      expiresAt: new Date(expiresAt),
      expiresAfterViews,
      accessType
    });

    return { id: `${Buffer.from(newSharedSecret.identifier!, "hex").toString("base64url")}` };
  };

  const getSharedSecrets = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    offset,
    limit
  }: TGetSharedSecretsDTO) => {
    if (!actorOrgId) throw new ForbiddenRequestError();

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    if (!permission) throw new ForbiddenRequestError({ name: "User does not belong to the specified organization" });

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

  const $decrementSecretViewCount = async (sharedSecret: TSecretSharing) => {
    const { expiresAfterViews } = sharedSecret;

    if (expiresAfterViews) {
      // decrement view count if view count expiry set
      await secretSharingDAL.updateById(sharedSecret.id, { $decr: { expiresAfterViews: 1 } });
    }

    await secretSharingDAL.updateById(sharedSecret.id, {
      lastViewedAt: new Date()
    });
  };

  /** Get's password-less secret. validates all secret's requested (must be fresh). */
  const getSharedSecretById = async ({ sharedSecretId, hashedHex, orgId, password }: TGetActiveSharedSecretByIdDTO) => {
    const sharedSecret = isUuidV4(sharedSecretId)
      ? await secretSharingDAL.findOne({
          id: sharedSecretId,
          hashedHex
        })
      : await secretSharingDAL.findOne({
          identifier: Buffer.from(sharedSecretId, "base64url").toString("hex")
        });

    if (!sharedSecret)
      throw new NotFoundError({
        message: "Shared secret not found"
      });

    const { accessType, expiresAt, expiresAfterViews } = sharedSecret;

    const orgName = sharedSecret.orgId ? (await orgDAL.findOrgById(sharedSecret.orgId))?.name : "";

    if (accessType === SecretSharingAccessType.Organization && orgId !== sharedSecret.orgId)
      throw new ForbiddenRequestError();

    // all secrets pass through here, meaning we check if its expired first and then check if it needs verification
    // or can be safely sent to the client.
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

    const isPasswordProtected = Boolean(sharedSecret.password);
    const hasProvidedPassword = Boolean(password);
    if (isPasswordProtected) {
      if (hasProvidedPassword) {
        const isMatch = await bcrypt.compare(password as string, sharedSecret.password as string);
        if (!isMatch) throw new UnauthorizedError({ message: "Invalid credentials" });
      } else {
        return { isPasswordProtected };
      }
    }

    // If encryptedSecret is set, we know that this secret has been encrypted using KMS, and we can therefore do server-side decryption.
    let decryptedSecretValue: Buffer | undefined;
    if (sharedSecret.encryptedSecret) {
      const decryptWithRoot = kmsService.decryptWithRootKey();
      decryptedSecretValue = decryptWithRoot(sharedSecret.encryptedSecret);
    }

    // decrement when we are sure the user will view secret.
    await $decrementSecretViewCount(sharedSecret);

    return {
      isPasswordProtected,
      secret: {
        ...sharedSecret,
        ...(decryptedSecretValue && {
          secretValue: Buffer.from(decryptedSecretValue).toString()
        }),
        orgName:
          sharedSecret.accessType === SecretSharingAccessType.Organization && orgId === sharedSecret.orgId
            ? orgName
            : undefined
      }
    };
  };

  const deleteSharedSecretById = async (deleteSharedSecretInput: TDeleteSharedSecretDTO) => {
    const { actor, actorId, orgId, actorAuthMethod, actorOrgId, sharedSecretId } = deleteSharedSecretInput;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    if (!permission) throw new ForbiddenRequestError({ name: "User does not belong to the specified organization" });

    const sharedSecret = isUuidV4(sharedSecretId)
      ? await secretSharingDAL.findById(sharedSecretId)
      : await secretSharingDAL.findOne({ identifier: sharedSecretId });

    const deletedSharedSecret = await secretSharingDAL.deleteById(sharedSecretId);

    if (sharedSecret.orgId && sharedSecret.orgId !== orgId)
      throw new ForbiddenRequestError({ message: "User does not have permission to delete shared secret" });

    return deletedSharedSecret;
  };

  return {
    createSharedSecret,
    createPublicSharedSecret,
    getSharedSecrets,
    deleteSharedSecretById,
    getSharedSecretById
  };
};
