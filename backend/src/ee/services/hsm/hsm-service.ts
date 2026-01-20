import pkcs11js from "pkcs11js";

import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { HsmKeyType, HsmModule, HsmEncryptionStrategy, HsmEncryptionProvider } from "./hsm-types";
import { aesEncryptionProvider } from "./hsm-service-aes";
import { rsaPkcsEncryptionProvider } from "./hsm-service-rsa-pkcs";

type THsmServiceFactoryDep = {
  hsmModule: HsmModule;
  envConfig: Pick<TEnvConfig, "HSM_PIN" | "HSM_SLOT" | "HSM_LIB_PATH" | "HSM_KEY_LABEL" | "isHsmConfigured" | "HSM_ENCRYPTION_STRATEGY">;
};

export type THsmServiceFactory = ReturnType<typeof hsmServiceFactory>;

type SyncOrAsync<T> = T | Promise<T>;
type SessionCallback<T> = (session: pkcs11js.Handle) => SyncOrAsync<T>;

// eslint-disable-next-line no-empty-pattern
export const hsmServiceFactory = ({ hsmModule: { isInitialized, pkcs11 }, envConfig }: THsmServiceFactoryDep) => {
  let pkcs11TestPassed = false;

  // Select encryption provider based on strategy
  const encryptionProvider: HsmEncryptionProvider = (() => {
    switch (envConfig.HSM_ENCRYPTION_STRATEGY) {
      case HsmEncryptionStrategy.RSA_PKCS:
        return rsaPkcsEncryptionProvider({ pkcs11, envConfig });
      case HsmEncryptionStrategy.AES:
      default:
        return aesEncryptionProvider({ pkcs11, envConfig });
    }
  })();

  const $withSession = async <T>(callbackWithSession: SessionCallback<T>): Promise<T> => {
    const RETRY_INTERVAL = 200; // 200ms between attempts
    const MAX_TIMEOUT = 90_000; // 90 seconds maximum total time

    let sessionHandle: pkcs11js.Handle | null = null;

    const removeSession = () => {
      if (sessionHandle !== null) {
        try {
          pkcs11.C_Logout(sessionHandle);
          pkcs11.C_CloseSession(sessionHandle);
          logger.info("HSM: Terminated session successfully");
        } catch (error) {
          logger.error(error, "HSM: Failed to terminate session");
        } finally {
          sessionHandle = null;
        }
      }
    };

    try {
      if (!pkcs11 || !isInitialized) {
        throw new Error("PKCS#11 module is not initialized");
      }

      // Get slot list
      let slots: pkcs11js.Handle[];
      try {
        slots = pkcs11.C_GetSlotList(false); // false to get all slots
      } catch (error) {
        throw new Error(`Failed to get slot list: ${(error as Error)?.message}`);
      }

      if (slots.length === 0) {
        throw new Error("No slots available");
      }

      if (envConfig.HSM_SLOT >= slots.length) {
        throw new Error(`HSM slot ${envConfig.HSM_SLOT} not found or not initialized`);
      }

      const slotId = slots[envConfig.HSM_SLOT];

      const startTime = Date.now();
      while (Date.now() - startTime < MAX_TIMEOUT) {
        try {
          // Open session
          // eslint-disable-next-line no-bitwise
          sessionHandle = pkcs11.C_OpenSession(slotId, pkcs11js.CKF_SERIAL_SESSION | pkcs11js.CKF_RW_SESSION);

          // Login
          try {
            pkcs11.C_Login(sessionHandle, pkcs11js.CKU_USER, envConfig.HSM_PIN);
            logger.info("HSM: Successfully authenticated");
            break;
          } catch (error) {
            // Handle specific error cases
            if (error instanceof pkcs11js.Pkcs11Error) {
              if (error.code === pkcs11js.CKR_PIN_INCORRECT) {
                // We throw instantly here to prevent further attempts, because if too many attempts are made, the HSM will potentially wipe all key material
                logger.error(error, `HSM: Incorrect PIN detected for HSM slot ${envConfig.HSM_SLOT}`);
                throw new Error("HSM: Incorrect HSM Pin detected. Please check the HSM configuration.");
              }
              if (error.code === pkcs11js.CKR_USER_ALREADY_LOGGED_IN) {
                logger.warn("HSM: Session already logged in");
              }
            }
            throw error; // Re-throw other errors
          }
        } catch (error) {
          logger.warn(`HSM: Session creation failed. Retrying... Error: ${(error as Error)?.message}`);

          if (sessionHandle !== null) {
            try {
              pkcs11.C_CloseSession(sessionHandle);
            } catch (closeError) {
              logger.error(closeError, "HSM: Failed to close session");
            }
            sessionHandle = null;
          }

          // Wait before retrying
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => {
            setTimeout(resolve, RETRY_INTERVAL);
          });
        }
      }

      if (sessionHandle === null) {
        throw new Error("HSM: Failed to open session after maximum retries");
      }

      // Execute callback with session handle
      const result = await callbackWithSession(sessionHandle);
      removeSession();
      return result;
    } catch (error) {
      logger.error(error, "HSM: Failed to open session");
      throw error;
    } finally {
      // Ensure cleanup
      removeSession();
    }
  };


  const encrypt: {
    (data: Buffer, providedSession: pkcs11js.Handle): Promise<Buffer>;
    (data: Buffer): Promise<Buffer>;
  } = async (data: Buffer, providedSession?: pkcs11js.Handle) => {
    if (!pkcs11 || !isInitialized) {
      throw new Error("PKCS#11 module is not initialized");
    }

    const $performEncryption = (sessionHandle: pkcs11js.Handle) => {
      return encryptionProvider.encrypt(data, sessionHandle);
    };

    if (providedSession) {
      return $performEncryption(providedSession);
    }

    const result = await $withSession($performEncryption);
    return result;
  };

  const decrypt: {
    (encryptedBlob: Buffer, providedSession: pkcs11js.Handle): Promise<Buffer>;
    (encryptedBlob: Buffer): Promise<Buffer>;
  } = async (encryptedBlob: Buffer, providedSession?: pkcs11js.Handle): Promise<Buffer> => {
    if (!pkcs11 || !isInitialized) {
      throw new Error("PKCS#11 module is not initialized");
    }

    const $performDecryption = (sessionHandle: pkcs11js.Handle) => {
      return encryptionProvider.decrypt(encryptedBlob, sessionHandle);
    };

    if (providedSession) {
      return $performDecryption(providedSession);
    }

    const result = await $withSession($performDecryption);
    return result;
  };

  // We test the core functionality of the PKCS#11 module that we are using throughout Infisical. This is to ensure that the user doesn't configure a faulty or unsupported HSM device.
  const $testPkcs11Module = (session: pkcs11js.Handle) => {
    try {
      if (!pkcs11 || !isInitialized) {
        throw new Error("PKCS#11 module is not initialized");
      }

      if (!session) {
        throw new Error("HSM: Attempted to run test without a valid session");
      }

      return encryptionProvider.testEncryptionDecryption(session);
    } catch (error) {
      logger.error(error, "HSM: Error testing PKCS#11 module");
      return false;
    }
  };

  const isActive = async () => {
    if (!isInitialized || !envConfig.isHsmConfigured) {
      return false;
    }

    if (pkcs11TestPassed) {
      return true;
    }

    try {
      pkcs11TestPassed = await $withSession((session) => Promise.resolve($testPkcs11Module(session)));
    } catch (err) {
      logger.error(err, "HSM: Error testing PKCS#11 module");
    }

    return pkcs11TestPassed;
  };

  const startService = async () => {
    if (!envConfig.isHsmConfigured || !pkcs11 || !isInitialized) return;

    try {
      await $withSession((sessionHandle) => {
        // Initialize keys using selected encryption provider
        encryptionProvider.initializeKeys(sessionHandle);

        // Get slot info to check supported mechanisms
        const slotId = pkcs11.C_GetSessionInfo(sessionHandle).slotID;
        const mechanisms = pkcs11.C_GetMechanismList(slotId);

        // Validate required mechanisms for selected strategy
        if (envConfig.HSM_ENCRYPTION_STRATEGY === HsmEncryptionStrategy.AES) {
          const hasAesCbc = mechanisms.includes(pkcs11js.CKM_AES_CBC_PAD);
          if (!hasAesCbc) {
            throw new Error("Required mechanism CKM_AES_CBC_PAD not supported by HSM");
          }
          logger.info("HSM: AES-CBC mechanism verified");
        } else if (envConfig.HSM_ENCRYPTION_STRATEGY === HsmEncryptionStrategy.RSA_PKCS) {
          const hasRsaPkcs = mechanisms.includes(pkcs11js.CKM_RSA_PKCS);
          const hasRsaKeyGen = mechanisms.includes(pkcs11js.CKM_RSA_PKCS_KEY_PAIR_GEN);
          if (!hasRsaPkcs || !hasRsaKeyGen) {
            throw new Error("Required mechanisms CKM_RSA_PKCS or CKM_RSA_PKCS_KEY_PAIR_GEN not supported by HSM");
          }
          logger.info("HSM: RSA-PKCS mechanisms verified");
        }

        // Run test encryption/decryption
        const testPassed = $testPkcs11Module(sessionHandle);

        if (!testPassed) {
          throw new Error("PKCS#11 module test failed. Please ensure that the HSM is correctly configured.");
        }

        logger.info(
          `HSM service started with ${envConfig.HSM_ENCRYPTION_STRATEGY || "AES"} encryption strategy`
        );
      });
    } catch (error) {
      logger.error(error, "HSM: Error initializing HSM service:");
      throw error;
    }
  };

  const randomBytes = async (length: number) => {
    if (!pkcs11 || !isInitialized) {
      throw new Error("PKCS#11 module is not initialized");
    }

    const randomData = await $withSession((sessionHandle) =>
      pkcs11.C_GenerateRandom(sessionHandle, Buffer.alloc(length))
    );

    return randomData;
  };

  return {
    encrypt,
    startService,
    isActive,
    decrypt,
    randomBytes
  };
};
