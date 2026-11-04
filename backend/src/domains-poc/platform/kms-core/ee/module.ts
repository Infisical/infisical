import { TDbClient } from "@app/db";
import { TDomainModule } from "@app/domains-poc/lib/domain-module";
import { TransactionRunner } from "@app/domains-poc/lib/transaction-runner";
import type { TBillingCoreService } from "@app/domains-poc/platform/billing-core";

import type { TKmsCoreHooks } from "../module";
import { buildKmsCoreEeDataAccess } from "./data-access";
import { ExternalKms } from "./model/external-kms";
import { registerExternalKmsRouter } from "./router/external-kms-router";
import { PocExternalKeyProvider } from "./service/external-key-provider";
import { ExternalKmsService } from "./service/external-kms-service";

export interface TKmsCoreEeService {
  assignExternalKmsToOrgKey(orgId: string): Promise<ExternalKms>;
}

export class KmsCoreEeModule implements TDomainModule<TKmsCoreEeService> {
  readonly name = "kms-core-ee";

  readonly service: TKmsCoreEeService;

  readonly hooks: TKmsCoreHooks;

  readonly routes: TDomainModule<TKmsCoreEeService>["routes"];

  constructor({
    db,
    rootKey,
    billingCore,
    externalKmsProviderKey
  }: {
    db: TDbClient;
    rootKey: Buffer;
    billingCore: TBillingCoreService;
    externalKmsProviderKey: Buffer;
  }) {
    const externalKmsService = new ExternalKmsService({
      dataAccess: buildKmsCoreEeDataAccess(db),
      transactionRunner: new TransactionRunner(db, buildKmsCoreEeDataAccess),
      externalKeyProvider: new PocExternalKeyProvider(externalKmsProviderKey),
      rootKey,
      billingCore
    });

    this.service = {
      assignExternalKmsToOrgKey: (orgId) => externalKmsService.assignToOrgKey(orgId)
    };
    this.hooks = {
      unwrapOrgKey: (kmsKey) => externalKmsService.unwrapOrgKey(kmsKey)
    };
    this.routes = {
      v1: async (server) => {
        await server.register(
          async (router: FastifyZodProvider) => registerExternalKmsRouter(router, { externalKmsService }),
          { prefix: "/poc/kms" }
        );
      }
    };
  }
}
