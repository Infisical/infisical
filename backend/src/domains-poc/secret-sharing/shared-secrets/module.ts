import { TDbClient } from "@app/db";
import { TDomainModule } from "@app/domains-poc/lib/domain-module";
import { TransactionRunner } from "@app/domains-poc/lib/transaction-runner";
import type { TKmsCoreService } from "@app/domains-poc/platform/kms-core";

import { buildSecretSharingDataAccess } from "./data-access";
import type { SharedSecret, TSharedSecretActor } from "./model/shared-secret";
import { registerSharedSecretRouter } from "./router/shared-secret-router";
import { SharedSecretService, TCreateSharedSecretInput } from "./service/shared-secret-service";

export type { SharedSecret, TCreateSharedSecretInput, TSharedSecretActor };

export interface TSecretSharingService {
  createSharedSecret(actor: TSharedSecretActor, input: TCreateSharedSecretInput): Promise<SharedSecret>;
}

export class SecretSharingModule implements TDomainModule<TSecretSharingService> {
  readonly name = "secret-sharing";

  readonly service: TSecretSharingService;

  readonly routes: TDomainModule<TSecretSharingService>["routes"];

  constructor({ db, kmsCore }: { db: TDbClient; kmsCore: TKmsCoreService }) {
    const dataAccess = buildSecretSharingDataAccess(db);
    const sharedSecretService = new SharedSecretService({
      sharedSecretDataAccess: dataAccess.sharedSecrets,
      transactionRunner: new TransactionRunner(db, buildSecretSharingDataAccess),
      kmsCore
    });

    this.service = {
      createSharedSecret: (actor, input) => sharedSecretService.createSharedSecret(actor, input)
    };
    this.routes = {
      v1: async (server) => {
        await server.register(
          async (router: FastifyZodProvider) => registerSharedSecretRouter(router, { sharedSecretService }),
          { prefix: "/poc/shared-secrets" }
        );
      }
    };
  }
}
