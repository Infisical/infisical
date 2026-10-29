import { TDbClient } from "@app/db";
import { TDomainModule } from "@app/domains-poc/domain-module";
import type { TKmsCoreService } from "@app/domains-poc/functional/platform/kms-core/contract";

import { TSecretSharingService } from "./contract";
import { createSharedSecretRepository } from "./repository/shared-secret-repository";
import { createSecretSharingUnitOfWork } from "./repository/unit-of-work";
import { registerSharedSecretRouter } from "./router/shared-secret-router";
import { createSharedSecretService } from "./service/shared-secret-service";

export const createSecretSharingModule = ({
  db,
  kmsCore
}: {
  db: TDbClient;
  kmsCore: TKmsCoreService;
}): TDomainModule<TSecretSharingService> => {
  const sharedSecretService = createSharedSecretService({
    sharedSecretRepository: createSharedSecretRepository(db),
    unitOfWork: createSecretSharingUnitOfWork(db),
    kmsCore
  });

  return {
    name: "secret-sharing",
    service: {
      createSharedSecret: sharedSecretService.createSharedSecret
    },
    routes: {
      v1: {
        community: async (server) => {
          await server.register(
            async (router: FastifyZodProvider) => registerSharedSecretRouter(router, { sharedSecretService }),
            { prefix: "/poc-functional/shared-secrets" }
          );
        }
      }
    }
  };
};
