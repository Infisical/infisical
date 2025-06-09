import * as pkcs11js from "pkcs11js";

import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { HsmModule } from "./hsm-types";

export const initializeHsmModule = (envConfig: Pick<TEnvConfig, "isHsmConfigured" | "HSM_LIB_PATH">) => {
  // Create a new instance of PKCS11 module
  const pkcs11 = new pkcs11js.PKCS11();
  let isInitialized = false;

  const initialize = () => {
    if (!envConfig.isHsmConfigured) {
      return;
    }

    try {
      // Load the PKCS#11 module
      pkcs11.load(envConfig.HSM_LIB_PATH!);

      // Initialize the module
      pkcs11.C_Initialize();
      isInitialized = true;

      logger.info("PKCS#11 module initialized");
    } catch (error) {
      if (error instanceof pkcs11js.Pkcs11Error && error.code === pkcs11js.CKR_CRYPTOKI_ALREADY_INITIALIZED) {
        logger.info("Skipping HSM initialization because it's already initialized.");
      } else {
        logger.error(error, "Failed to initialize PKCS#11 module");
        throw error;
      }
    }
  };

  const finalize = () => {
    if (isInitialized) {
      try {
        pkcs11.C_Finalize();
        isInitialized = false;
        logger.info("PKCS#11 module finalized");
      } catch (err) {
        logger.error(err, "Failed to finalize PKCS#11 module");
        throw err;
      }
    }
  };

  const getModule = (): HsmModule => ({
    pkcs11,
    isInitialized
  });

  return {
    initialize,
    finalize,
    getModule
  };
};
