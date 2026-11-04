import { TTransactionRunner } from "@app/domains-poc/lib/transaction-runner";
import type { TKmsCoreService } from "@app/domains-poc/platform/kms-core";
import { NotFoundError } from "@app/lib/errors";

import { TSecretSharingDataAccess } from "../data-access";
import { TSharedSecretDataAccess } from "../data-access/shared-secret-data-access";
import { SharedSecret, TSharedSecretActor } from "../model/shared-secret";

export type TCreateSharedSecretInput = {
  name?: string;
  value: string;
  expiresAt: Date;
  maxViews?: number;
};

export interface TSharedSecretService {
  createSharedSecret(actor: TSharedSecretActor, input: TCreateSharedSecretInput): Promise<SharedSecret>;
  viewSharedSecret(sharedSecretId: string): Promise<{ sharedSecret: SharedSecret; value: string }>;
  deleteSharedSecret(actor: TSharedSecretActor, sharedSecretId: string): Promise<SharedSecret>;
}

const sharedSecretNotFound = (sharedSecretId: string) =>
  new NotFoundError({ message: `Shared secret with ID "${sharedSecretId}" not found` });

export type TSharedSecretServiceDependencies = {
  sharedSecretDataAccess: TSharedSecretDataAccess;
  transactionRunner: TTransactionRunner<TSecretSharingDataAccess>;
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
    await this.deps.sharedSecretDataAccess.create(sharedSecret);

    return sharedSecret;
  }

  async viewSharedSecret(sharedSecretId: string) {
    const sharedSecret = await this.deps.transactionRunner.run(async ({ sharedSecrets }) => {
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
    const sharedSecret = await this.deps.sharedSecretDataAccess.findById(sharedSecretId);
    if (!sharedSecret) throw sharedSecretNotFound(sharedSecretId);

    sharedSecret.assertCanBeDeletedBy(actor);
    await this.deps.sharedSecretDataAccess.delete(sharedSecretId);

    return sharedSecret;
  }
}
