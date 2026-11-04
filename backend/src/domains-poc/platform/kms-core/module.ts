import { TDbClient } from "@app/db";
import { TDomainModule } from "@app/domains-poc/lib/domain-module";
import { TransactionRunner } from "@app/domains-poc/lib/transaction-runner";

import { buildKmsCoreDataAccess } from "./data-access";
import { KmsKey } from "./model/kms-key";
import { registerKmsKeyRouter } from "./router/kms-key-router";
import {
  KmsCryptoService,
  TDecryptWithOrgKeyInput,
  TEncryptWithOrgKeyInput,
  TKmsCoreHooks
} from "./service/kms-crypto-service";
import { KmsKeyService } from "./service/kms-key-service";

export type { KmsKey, TDecryptWithOrgKeyInput, TEncryptWithOrgKeyInput, TKmsCoreHooks };

export interface TKmsCoreService {
  encryptWithOrgKey(input: TEncryptWithOrgKeyInput): Promise<Buffer>;
  decryptWithOrgKey(input: TDecryptWithOrgKeyInput): Promise<Buffer>;
}

export class KmsCoreModule implements TDomainModule<TKmsCoreService> {
  readonly name = "kms-core";

  readonly service: TKmsCoreService;

  readonly routes: TDomainModule<TKmsCoreService>["routes"];

  constructor({ db, rootKey }: { db: TDbClient; rootKey: Buffer }, hooks: TKmsCoreHooks = {}) {
    const dataAccess = buildKmsCoreDataAccess(db);
    const kmsCryptoService = new KmsCryptoService({
      kmsKeyDataAccess: dataAccess.kmsKeys,
      transactionRunner: new TransactionRunner(db, buildKmsCoreDataAccess),
      rootKey,
      hooks
    });
    const kmsKeyService = new KmsKeyService({ kmsKeyDataAccess: dataAccess.kmsKeys });

    // Arrow wrappers keep `this` bound when a consumer destructures the public service.
    this.service = {
      encryptWithOrgKey: (input) => kmsCryptoService.encryptWithOrgKey(input),
      decryptWithOrgKey: (input) => kmsCryptoService.decryptWithOrgKey(input)
    };
    this.routes = {
      v1: async (server) => {
        await server.register(async (router: FastifyZodProvider) => registerKmsKeyRouter(router, { kmsKeyService }), {
          prefix: "/poc/kms"
        });
      }
    };
  }
}
