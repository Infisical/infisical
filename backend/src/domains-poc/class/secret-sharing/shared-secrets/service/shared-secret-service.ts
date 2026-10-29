import type { TKmsCoreService } from "@app/domains-poc/class/platform/kms-core/contract";
import { NotFoundError } from "@app/lib/errors";

import { TCreateSharedSecretInput } from "../contract";
import { SharedSecret, TSharedSecretActor } from "../model/shared-secret";
import { TSharedSecretRepository } from "../repository/shared-secret-repository";
import { TSecretSharingUnitOfWork } from "../repository/unit-of-work";

export interface TSharedSecretService {
  createSharedSecret(actor: TSharedSecretActor, input: TCreateSharedSecretInput): Promise<SharedSecret>;
  viewSharedSecret(sharedSecretId: string): Promise<{ sharedSecret: SharedSecret; value: string }>;
  deleteSharedSecret(actor: TSharedSecretActor, sharedSecretId: string): Promise<SharedSecret>;
}

const sharedSecretNotFound = (sharedSecretId: string) =>
  new NotFoundError({ message: `Shared secret with ID "${sharedSecretId}" not found` });

export type TSharedSecretServiceDependencies = {
  sharedSecretRepository: TSharedSecretRepository;
  unitOfWork: TSecretSharingUnitOfWork;
  kmsCore: TKmsCoreService;
};

export class SharedSecretService implements TSharedSecretService {
  constructor(private readonly deps: TSharedSecretServiceDependencies) {}

  async createSharedSecret(actor: TSharedSecretActor, input: TCreateSharedSecretInput) {
    const encryptedValue = await this.deps.kmsCore.encryptWithOrgKey({
      orgId: actor.orgId,
      plaintext: Buffer.from(input.value)
    });

    const sharedSecret = SharedSecret.create({
      actor,
      name: input.name,
      encryptedValue,
      expiresAt: input.expiresAt,
      maxViews: input.maxViews,
      now: new Date()
    });
    await this.deps.sharedSecretRepository.create(sharedSecret);

    return sharedSecret;
  }

  async viewSharedSecret(sharedSecretId: string) {
    const sharedSecret = await this.deps.unitOfWork.run(async ({ sharedSecrets }) => {
      const lockedSharedSecret = await sharedSecrets.findByIdForUpdate(sharedSecretId);
      if (!lockedSharedSecret) throw sharedSecretNotFound(sharedSecretId);

      lockedSharedSecret.recordView(new Date());
      await sharedSecrets.update(lockedSharedSecret);
      return lockedSharedSecret;
    });

    // Decrypt after commit: KMS Core uses its own connection and must not run while this row is locked.
    const value = await this.deps.kmsCore.decryptWithOrgKey({
      orgId: sharedSecret.orgId,
      ciphertext: sharedSecret.encryptedValue
    });

    return { sharedSecret, value: value.toString() };
  }

  async deleteSharedSecret(actor: TSharedSecretActor, sharedSecretId: string) {
    const sharedSecret = await this.deps.sharedSecretRepository.findById(sharedSecretId);
    if (!sharedSecret) throw sharedSecretNotFound(sharedSecretId);

    sharedSecret.assertCanBeDeletedBy(actor);
    await this.deps.sharedSecretRepository.delete(sharedSecretId);

    return sharedSecret;
  }
}
