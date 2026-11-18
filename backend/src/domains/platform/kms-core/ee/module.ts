import { logger } from "@app/lib/logger";

import { TKmsCoreHooks } from "../ce/services/dependencies";
import { defaultExternalKmsProviders } from "./clients/external-kms/providers";
import { createHsmClient } from "./clients/hsm/client";
import { HsmModule, initializeHsmModule, THsmConfig } from "./clients/hsm/module";
import { HsmRootKeyWrapper } from "./clients/hsm/root-key-wrapper";
import { TExternalKmsProviders } from "./services/dependencies";
import { ExternalKeyCipherService } from "./services/external-key-cipher/service";

export type TKmsCoreEeDeps = {
  hsmConfig: THsmConfig;
  // Read on every check. Migrations answer true since the license isn't read yet.
  isHsmEntitled: () => boolean;
  providers?: TExternalKmsProviders;
};

// HSM root key wrapping and external key encryption, handed to KMS Core as hooks. External key management lives in
// ExternalKmsEeModule, built after KMS Core.
export class KmsCoreEeModule {
  private constructor(
    readonly hooks: TKmsCoreHooks,
    private hsmModule: HsmModule
  ) {}

  // Inits PKCS#11 and creates the device keys when an HSM is configured. Build before KmsCoreModule.create, which may
  // need the HSM to unwrap the root key.
  static async create(deps: TKmsCoreEeDeps): Promise<KmsCoreEeModule> {
    const hsmModule = initializeHsmModule(deps.hsmConfig);
    const client = createHsmClient({ hsmModule, envConfig: deps.hsmConfig });
    await client.startService();
    const externalKms = new ExternalKeyCipherService(deps.providers ?? defaultExternalKmsProviders());
    return new KmsCoreEeModule(
      { rootKeyWrapper: new HsmRootKeyWrapper(client, deps.isHsmEntitled), externalKms },
      hsmModule
    );
  }

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
