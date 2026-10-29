import { TDbClient } from "@app/db";
import { TDomainModule } from "@app/domains-poc/domain-module";

import { TKmsCoreService } from "./contract";
import { KmsKeyRepository } from "./repository/kms-key-repository";
import { KmsCoreUnitOfWork } from "./repository/unit-of-work";
import { registerKmsKeyRouter } from "./router/kms-key-router";
import { KmsCryptoService } from "./service/kms-crypto-service";
import { KmsKeyService } from "./service/kms-key-service";

export class KmsCoreModule implements TDomainModule<TKmsCoreService> {
  readonly name = "kms-core";

  readonly service: TKmsCoreService;

  readonly routes: TDomainModule<TKmsCoreService>["routes"];

  constructor({ db, rootKey }: { db: TDbClient; rootKey: Buffer }) {
    const kmsKeyRepository = new KmsKeyRepository(db);
    const kmsCryptoService = new KmsCryptoService({
      kmsKeyRepository,
      unitOfWork: new KmsCoreUnitOfWork(db),
      rootKey
    });
    const kmsKeyService = new KmsKeyService({ kmsKeyRepository });

    // Arrow wrappers keep `this` bound when a consumer destructures the public service.
    this.service = {
      encryptWithOrgKey: (input) => kmsCryptoService.encryptWithOrgKey(input),
      decryptWithOrgKey: (input) => kmsCryptoService.decryptWithOrgKey(input)
    };
    this.routes = {
      v1: {
        community: async (server) => {
          await server.register(async (router: FastifyZodProvider) => registerKmsKeyRouter(router, { kmsKeyService }), {
            prefix: "/poc-class/kms"
          });
        }
      }
    };
  }
}
