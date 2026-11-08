import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { logger } from "@app/lib/logger";

import { buildKmsCoreDataAccessDeps, TKmsCoreHooks } from "../ce/module";
import { defaultExternalKmsProviders, TExternalKmsProviders } from "./external-kms-client/external-kms-providers";
import { createHsmClient } from "./hsm-client/hsm-client";
import { HsmModule, initializeHsmModule, THsmConfig } from "./hsm-client/hsm-module";
import { ExternalKmsService } from "./service/external-kms-service";
import { HsmRootKeyWrapper } from "./service/hsm-root-key-wrapper";

export type TKmsCoreEeDeps = {
  db: DataAccessDb;
  hsmConfig: THsmConfig;
  providers?: TExternalKmsProviders;
};

// HSM root key wrapping and external KMS keys, handed to KMS Core as its hooks.
export class KmsCoreEeModule {
  readonly hooks: TKmsCoreHooks;

  private readonly wrapper = new HsmRootKeyWrapper();

  private hsmModule: HsmModule | undefined;

  constructor(private readonly deps: TKmsCoreEeDeps) {
    const { transactionRunner, dataAccess } = buildKmsCoreDataAccessDeps(deps.db);
    const externalKms = new ExternalKmsService({
      transactionRunner,
      dataAccess,
      providers: deps.providers ?? defaultExternalKmsProviders()
    });

    this.hooks = {
      rootKeyWrapper: this.wrapper,
      externalKms: {
        encrypt: (ref, orgCipher, plainText) => externalKms.encrypt(ref, orgCipher, plainText),
        decrypt: (ref, orgCipher, cipherTextBlob) => externalKms.decrypt(ref, orgCipher, cipherTextBlob),
        create: (input, orgCipher) => externalKms.create(input, orgCipher),
        update: (input, orgCipher) => externalKms.update(input, orgCipher),
        delete: (kmsId, orgCipher) => externalKms.delete(kmsId, orgCipher),
        get: (kmsId, orgCipher) => externalKms.get(kmsId, orgCipher),
        list: (orgId) => externalKms.list(orgId),
        fetchGcpKeys: (input) => externalKms.fetchGcpKeys(input)
      }
    };
  }

  // Initialises the PKCS#11 library and creates the device keys when an HSM is configured. Called once at boot,
  // before KmsCoreModule.start, with the instance license's HSM entitlement (migrations pass true: they run before
  // the license is read).
  async start({ hsmEntitled }: { hsmEntitled: boolean }): Promise<void> {
    this.hsmModule = initializeHsmModule(this.deps.hsmConfig);
    const client = createHsmClient({ hsmModule: this.hsmModule, envConfig: this.deps.hsmConfig });
    await client.startService();
    this.wrapper.attach(client, hsmEntitled);
  }

  // Releases the PKCS#11 library on shutdown.
  stop() {
    if (!this.hsmModule?.isInitialized) return;
    try {
      this.hsmModule.pkcs11.C_Finalize();
      this.hsmModule = { ...this.hsmModule, isInitialized: false };
      logger.info("PKCS#11 module finalized");
    } catch (error) {
      logger.error(error, "Failed to finalize PKCS#11 module");
    }
  }
}
