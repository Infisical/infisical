import { TTransactionRunner } from "@app/domains-poc/lib/transaction-runner";
import type { TBillingCoreService } from "@app/domains-poc/platform/billing-core";
import { BadRequestError } from "@app/lib/errors";

import { KmsKey } from "../../model/kms-key";
import { getOrgKeyOrThrow, unwrapWithRootKey } from "../../service/org-key";
import { TKmsCoreEeDataAccess } from "../data-access";
import { ExternalKms } from "../model/external-kms";
import { TExternalKeyProvider } from "./external-key-provider";

export interface TExternalKmsService {
  assignToOrgKey(orgId: string): Promise<ExternalKms>;
  unwrapOrgKey(kmsKey: KmsKey): Promise<Buffer | undefined>;
}

export type TExternalKmsServiceDependencies = {
  dataAccess: TKmsCoreEeDataAccess;
  transactionRunner: TTransactionRunner<TKmsCoreEeDataAccess>;
  externalKeyProvider: TExternalKeyProvider;
  rootKey: Buffer;
  billingCore: TBillingCoreService;
};

export class ExternalKmsService implements TExternalKmsService {
  constructor(private readonly deps: TExternalKmsServiceDependencies) {}

  async assignToOrgKey(orgId: string) {
    await this.deps.billingCore.assertFeature(orgId, "externalKms");

    const kmsKey = await getOrgKeyOrThrow(this.deps.dataAccess.kmsKeys, orgId);
    if (await this.deps.dataAccess.externalKms.findByKmsKeyId(kmsKey.id)) {
      throw new BadRequestError({ message: "This organization's KMS key already uses an external KMS" });
    }

    // Provider calls happen before the transaction so no connection is held during a network call.
    const keyMaterial = unwrapWithRootKey(kmsKey, this.deps.rootKey);
    kmsKey.rewrap(await this.deps.externalKeyProvider.encrypt(keyMaterial));
    const externalKms = ExternalKms.create({ kmsKeyId: kmsKey.id, provider: this.deps.externalKeyProvider.name });

    await this.deps.transactionRunner.run(async ({ kmsKeys, externalKms: externalKmsDataAccess }) => {
      await kmsKeys.updateKeyMaterial(kmsKey);
      await externalKmsDataAccess.create(externalKms);
    });

    return externalKms;
  }

  async unwrapOrgKey(kmsKey: KmsKey) {
    const externalKms = await this.deps.dataAccess.externalKms.findByKmsKeyId(kmsKey.id);
    if (!externalKms) return undefined;

    await this.deps.billingCore.assertFeature(kmsKey.orgId, "externalKms");
    return this.deps.externalKeyProvider.decrypt(kmsKey.encryptedKeyMaterial);
  }
}
