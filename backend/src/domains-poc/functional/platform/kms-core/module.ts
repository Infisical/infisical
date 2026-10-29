import { TDbClient } from "@app/db";
import { TDomainModule } from "@app/domains-poc/domain-module";

import { TKmsCoreService } from "./contract";
import { createKmsKeyRepository } from "./repository/kms-key-repository";
import { createKmsCoreUnitOfWork } from "./repository/unit-of-work";
import { registerKmsKeyRouter } from "./router/kms-key-router";
import { createKmsCryptoService } from "./service/kms-crypto-service";
import { createKmsKeyService } from "./service/kms-key-service";

export const createKmsCoreModule = ({
  db,
  rootKey
}: {
  db: TDbClient;
  rootKey: Buffer;
}): TDomainModule<TKmsCoreService> => {
  const kmsKeyRepository = createKmsKeyRepository(db);
  const kmsCryptoService = createKmsCryptoService({
    kmsKeyRepository,
    unitOfWork: createKmsCoreUnitOfWork(db),
    rootKey
  });
  const kmsKeyService = createKmsKeyService({ kmsKeyRepository });

  return {
    name: "kms-core",
    service: {
      encryptWithOrgKey: kmsCryptoService.encryptWithOrgKey,
      decryptWithOrgKey: kmsCryptoService.decryptWithOrgKey
    },
    routes: {
      v1: {
        community: async (server) => {
          await server.register(async (router: FastifyZodProvider) => registerKmsKeyRouter(router, { kmsKeyService }), {
            prefix: "/poc-functional/kms"
          });
        }
      }
    }
  };
};
