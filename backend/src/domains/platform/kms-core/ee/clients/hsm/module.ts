import * as pkcs11js from "pkcs11js";

import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

export type HsmModule = {
  pkcs11: pkcs11js.PKCS11;
  isInitialized: boolean;
};

export enum HsmKeyType {
  AES = "AES",
  HMAC = "hmac"
}

export type THsmConfig = Pick<
  TEnvConfig,
  "HSM_PIN" | "HSM_SLOT" | "HSM_LIB_PATH" | "HSM_KEY_LABEL" | "isHsmConfigured"
>;

// Loads and initialises the PKCS#11 library named by HSM_LIB_PATH. A no-op when no HSM is configured.
export const initializeHsmModule = (config: Pick<THsmConfig, "isHsmConfigured" | "HSM_LIB_PATH">): HsmModule => {
  const pkcs11 = new pkcs11js.PKCS11();
  if (!config.isHsmConfigured) return { pkcs11, isInitialized: false };

  try {
    pkcs11.load(config.HSM_LIB_PATH as string);
    pkcs11.C_Initialize();
    logger.info("PKCS#11 module initialized");
  } catch (error) {
    if ((error as { message?: string })?.message === "CKR_CRYPTOKI_ALREADY_INITIALIZED") {
      logger.info("Skipping HSM initialization because it's already initialized.");
    } else {
      logger.error(error, "Failed to initialize PKCS#11 module");
      throw error;
    }
  }
  return { pkcs11, isInitialized: true };
};
