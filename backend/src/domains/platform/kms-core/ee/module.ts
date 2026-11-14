import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { logger } from "@app/lib/logger";

import { buildKmsCoreStoreAccess } from "../ce/data-access/kms-core-stores";
import { TKmsCoreHooks } from "../ce/services/dependencies";
import { defaultExternalKmsProviders } from "./clients/external-kms/providers";
import { createHsmClient } from "./clients/hsm/client";
import { HsmModule, initializeHsmModule, THsmConfig } from "./clients/hsm/module";
import { HsmRootKeyWrapper } from "./clients/hsm/root-key-wrapper";
import { TExternalKmsProviders } from "./services/dependencies";
import { ExternalKmsService } from "./services/external-kms/service";

export type TKmsCoreEeDeps = {
  db: TDbClient;
  // What the external KMS service reads through outside a transaction: the replica on the server, the same
  // connection in a migration.
  readKnex: () => Knex;
  hsmConfig: THsmConfig;
  // The instance license's HSM entitlement, read on every check (migrations answer true: the license is not read yet).
  isHsmEntitled: () => boolean;
  providers?: TExternalKmsProviders;
};

// HSM root key wrapping and external KMS keys, handed to KMS Core as its hooks.
export class KmsCoreEeModule {
  private constructor(
    readonly hooks: TKmsCoreHooks,
    private hsmModule: HsmModule
  ) {}

  // Initialises the PKCS#11 library and creates the device keys when an HSM is configured. Built before
  // KmsCoreModule.create, which may need the HSM to unwrap the root key.
  static async create(deps: TKmsCoreEeDeps): Promise<KmsCoreEeModule> {
    const hsmModule = initializeHsmModule(deps.hsmConfig);
    const client = createHsmClient({ hsmModule, envConfig: deps.hsmConfig });
    await client.startService();
    const { transactionRunner, stores } = buildKmsCoreStoreAccess(deps.db, deps.readKnex);
    const externalKms = new ExternalKmsService(
      transactionRunner,
      stores,
      deps.providers ?? defaultExternalKmsProviders()
    );
    return new KmsCoreEeModule(
      { rootKeyWrapper: new HsmRootKeyWrapper(client, deps.isHsmEntitled), externalKms },
      hsmModule
    );
  }

  // Releases the PKCS#11 library on shutdown.
  stop() {
    if (!this.hsmModule.isInitialized) return;
    try {
      this.hsmModule.pkcs11.C_Finalize();
      this.hsmModule = { ...this.hsmModule, isInitialized: false };
      logger.info("PKCS#11 module finalized");
    } catch (error) {
      logger.error(error, "Failed to finalize PKCS#11 module");
    }
  }
}
