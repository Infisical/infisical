import type { TKmsCoreService } from "@app/domains-poc/functional/platform/kms-core/contract";
import { NotFoundError } from "@app/lib/errors";

import { TCreateSharedSecretInput } from "../contract";
import {
  assertSharedSecretDeletableBy,
  createSharedSecret as buildSharedSecret,
  recordSharedSecretView,
  TSharedSecret,
  TSharedSecretActor
} from "../model/shared-secret";
import { TSharedSecretRepository } from "../repository/shared-secret-repository";
import { TSecretSharingUnitOfWork } from "../repository/unit-of-work";

export type TSharedSecretService = {
  createSharedSecret: (actor: TSharedSecretActor, input: TCreateSharedSecretInput) => Promise<TSharedSecret>;
  viewSharedSecret: (sharedSecretId: string) => Promise<{ sharedSecret: TSharedSecret; value: string }>;
  deleteSharedSecret: (actor: TSharedSecretActor, sharedSecretId: string) => Promise<TSharedSecret>;
};

const sharedSecretNotFound = (sharedSecretId: string) =>
  new NotFoundError({ message: `Shared secret with ID "${sharedSecretId}" not found` });

export type TSharedSecretServiceDependencies = {
  sharedSecretRepository: TSharedSecretRepository;
  unitOfWork: TSecretSharingUnitOfWork;
  kmsCore: TKmsCoreService;
};

export const createSharedSecretService = ({
  sharedSecretRepository,
  unitOfWork,
  kmsCore
}: TSharedSecretServiceDependencies): TSharedSecretService => {
  const createSharedSecret = async (actor: TSharedSecretActor, input: TCreateSharedSecretInput) => {
    const encryptedValue = await kmsCore.encryptWithOrgKey({
      orgId: actor.orgId,
      plaintext: Buffer.from(input.value)
    });

    const sharedSecret = buildSharedSecret({
      actor,
      name: input.name,
      encryptedValue,
      expiresAt: input.expiresAt,
      maxViews: input.maxViews,
      now: new Date()
    });
    await sharedSecretRepository.create(sharedSecret);

    return sharedSecret;
  };

  const viewSharedSecret = async (sharedSecretId: string) => {
    const sharedSecret = await unitOfWork.run(async ({ sharedSecrets }) => {
      const lockedSharedSecret = await sharedSecrets.findByIdForUpdate(sharedSecretId);
      if (!lockedSharedSecret) throw sharedSecretNotFound(sharedSecretId);

      const viewedSharedSecret = recordSharedSecretView(lockedSharedSecret, new Date());
      await sharedSecrets.update(viewedSharedSecret);
      return viewedSharedSecret;
    });

    // Decrypt after commit: KMS Core uses its own connection and must not run while this row is locked.
    const value = await kmsCore.decryptWithOrgKey({
      orgId: sharedSecret.orgId,
      ciphertext: sharedSecret.encryptedValue
    });

    return { sharedSecret, value: value.toString() };
  };

  const deleteSharedSecret = async (actor: TSharedSecretActor, sharedSecretId: string) => {
    const sharedSecret = await sharedSecretRepository.findById(sharedSecretId);
    if (!sharedSecret) throw sharedSecretNotFound(sharedSecretId);

    assertSharedSecretDeletableBy(sharedSecret, actor);
    await sharedSecretRepository.delete(sharedSecretId);

    return sharedSecret;
  };

  return { createSharedSecret, viewSharedSecret, deleteSharedSecret };
};
