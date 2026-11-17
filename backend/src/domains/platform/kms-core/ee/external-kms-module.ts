import { Knex } from "knex";

import { TDbClient } from "@app/db";

import { buildKmsCoreStoreAccess } from "../ce/data-access/kms-core-stores";
import { TKmsDataKeyService } from "../ce/services/data-key/service";
import { TExternalKmsService } from "../ce/services/dependencies";
import { defaultExternalKmsProviders } from "./clients/external-kms/providers";
import { TExternalKmsProviders } from "./services/dependencies";
import { ExternalKmsService } from "./services/external-kms/service";

export type TExternalKmsEeDeps = {
  db: TDbClient;
  // Where reads outside a transaction go: the replica.
  readKnex: () => Knex;
  kmsDataKeyService: TKmsDataKeyService;
  providers?: TExternalKmsProviders;
};

// External key management. Unlike KmsCoreEeModule it is built after KmsCoreModule: provider inputs are encrypted with
// the org data key, which it reads through kmsDataKeyService.
export class ExternalKmsEeModule {
  readonly externalKmsService: TExternalKmsService;

  constructor(deps: TExternalKmsEeDeps) {
    const { transactionRunner, stores } = buildKmsCoreStoreAccess(deps.db, deps.readKnex);
    this.externalKmsService = new ExternalKmsService(
      transactionRunner,
      stores,
      deps.providers ?? defaultExternalKmsProviders(),
      deps.kmsDataKeyService
    );
  }
}
