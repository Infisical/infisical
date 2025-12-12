import * as pkcs11js from "pkcs11js";

import { SubscriptionProductCategory } from "@app/db/schemas";
import { TEnvConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { KMS_ROOT_CONFIG_UUID } from "@app/services/kms/kms-fns";
import { TKmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { RootKeyEncryptionStrategy } from "@app/services/kms/kms-types";

import { TLicenseServiceFactory } from "../license/license-service";
import { THsmServiceFactory } from "./hsm-service";
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
      if ((error as { message?: string })?.message === "CKR_CRYPTOKI_ALREADY_INITIALIZED") {
        logger.info("Skipping HSM initialization because it's already initialized.");
        isInitialized = true;
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

export const isHsmActiveAndEnabled = async ({
  hsmService,
  kmsRootConfigDAL,
  licenseService
}: {
  hsmService: Pick<THsmServiceFactory, "isActive">;
  kmsRootConfigDAL: Pick<TKmsRootConfigDALFactory, "findById">;
  licenseService?: Pick<TLicenseServiceFactory, "onPremFeatures">;
}) => {
  const isHsmConfigured = await hsmService.isActive();

  // null if the root kms config does not exist
  let rootKmsConfigEncryptionStrategy: RootKeyEncryptionStrategy | null = null;

  const rootKmsConfig = await kmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID).catch(() => null);

  rootKmsConfigEncryptionStrategy = (rootKmsConfig?.encryptionStrategy || null) as RootKeyEncryptionStrategy | null;
  if (
    rootKmsConfigEncryptionStrategy === RootKeyEncryptionStrategy.HSM &&
    licenseService &&
    !licenseService.onPremFeatures.get(SubscriptionProductCategory.Platform, "hsm")
  ) {
    throw new BadRequestError({
      message: "Your license does not include HSM integration. Please upgrade to the Enterprise plan to use HSM."
    });
  }

  return {
    rootKmsConfigEncryptionStrategy,
    isHsmConfigured
  };
};
