import { TDbClient } from "@app/db";
import type { TKmsCoreService } from "@app/domains-poc/class/platform/kms-core/contract";
import { TDomainModule } from "@app/domains-poc/domain-module";

import { TSecretSharingService } from "./contract";
import { SharedSecretRepository } from "./repository/shared-secret-repository";
import { SecretSharingUnitOfWork } from "./repository/unit-of-work";
import { registerSharedSecretRouter } from "./router/shared-secret-router";
import { SharedSecretService } from "./service/shared-secret-service";

export class SecretSharingModule implements TDomainModule<TSecretSharingService> {
  readonly name = "secret-sharing";

  readonly service: TSecretSharingService;

  readonly routes: TDomainModule<TSecretSharingService>["routes"];

  constructor({ db, kmsCore }: { db: TDbClient; kmsCore: TKmsCoreService }) {
    const sharedSecretService = new SharedSecretService({
      sharedSecretRepository: new SharedSecretRepository(db),
      unitOfWork: new SecretSharingUnitOfWork(db),
      kmsCore
    });

    this.service = {
      createSharedSecret: (actor, input) => sharedSecretService.createSharedSecret(actor, input)
    };
    this.routes = {
      v1: {
        community: async (server) => {
          await server.register(
            async (router: FastifyZodProvider) => registerSharedSecretRouter(router, { sharedSecretService }),
            {
              prefix: "/poc-class/shared-secrets"
            }
          );
        }
      }
    };
  }
}
