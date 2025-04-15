import pkcs11js from "pkcs11js";

import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { HsmKeyType, HsmModule } from "./hsm-types";

type THsmServiceFactoryDep = {
  hsmModule: HsmModule;
  envConfig: Pick<TEnvConfig, "HSM_PIN" | "HSM_SLOT" | "HSM_LIB_PATH" | "HSM_KEY_LABEL" | "isHsmConfigured">;
};

export type THsmServiceFactory = ReturnType<typeof hsmServiceFactory>;

type SyncOrAsync<T> = T | Promise<T>;
type SessionCallback<T> = (session: pkcs11js.Handle) => SyncOrAsync<T>;

// eslint-disable-next-line no-empty-pattern
export const hsmServiceFactory = ({ hsmModule: { isInitialized, pkcs11 }, envConfig }: THsmServiceFactoryDep) => {
  // Constants for buffer structures
  const IV_LENGTH = 16; // Luna HSM typically expects 16-byte IV for cbc
  const BLOCK_SIZE = 16;
  const HMAC_SIZE = 32;

  const AES_KEY_SIZE = 256;
  const HMAC_KEY_SIZE = 256;

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

  const $findKey = (sessionHandle: pkcs11js.Handle, type: HsmKeyType) => {
    const label = type === HsmKeyType.HMAC ? `${envConfig.HSM_KEY_LABEL}_HMAC` : envConfig.HSM_KEY_LABEL;
    const keyType = type === HsmKeyType.HMAC ? pkcs11js.CKK_GENERIC_SECRET : pkcs11js.CKK_AES;

    const template = [
      { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_SECRET_KEY },
      { type: pkcs11js.CKA_KEY_TYPE, value: keyType },
      { type: pkcs11js.CKA_LABEL, value: label }
    ];

    try {
      // Initialize search
      pkcs11.C_FindObjectsInit(sessionHandle, template);

      try {
        // Find first matching object
        const handles = pkcs11.C_FindObjects(sessionHandle, 1);

        if (handles.length === 0) {
          throw new Error("Failed to find master key");
        }

        return handles[0]; // Return the key handle
      } finally {
        // Always finalize the search operation
        pkcs11.C_FindObjectsFinal(sessionHandle);
      }
    } catch (error) {
      return null;
    }
  };

  const $keyExists = (session: pkcs11js.Handle, type: HsmKeyType): boolean => {
    try {
      const key = $findKey(session, type);
      // items(0) will throw an error if no items are found
      // Return true only if we got a valid object with handle
      return !!key && key.length > 0;
    } catch (error) {
      // If items(0) throws, it means no key was found
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
      logger.error(error, "HSM: Failed while checking for HSM key presence");

      if (error instanceof pkcs11js.Pkcs11Error) {
        if (error.code === pkcs11js.CKR_OBJECT_HANDLE_INVALID) {
          return false;
        }
      }

      return false;
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
      try {
        const aesKey = $findKey(sessionHandle, HsmKeyType.AES);
        if (!aesKey) {
          throw new Error("HSM: Encryption failed, AES key not found");
        }

        const hmacKey = $findKey(sessionHandle, HsmKeyType.HMAC);
        if (!hmacKey) {
          throw new Error("HSM: Encryption failed, HMAC key not found");
        }

        const iv = Buffer.alloc(IV_LENGTH);
        pkcs11.C_GenerateRandom(sessionHandle, iv);

        const encryptMechanism = {
          mechanism: pkcs11js.CKM_AES_CBC_PAD,
          parameter: iv
        };

        pkcs11.C_EncryptInit(sessionHandle, encryptMechanism, aesKey);

        // Calculate max buffer size (input length + potential full block of padding)
        const maxEncryptedLength = Math.ceil(data.length / BLOCK_SIZE) * BLOCK_SIZE + BLOCK_SIZE;

        // Encrypt the data - this returns the encrypted data directly
        const encryptedData = pkcs11.C_Encrypt(sessionHandle, data, Buffer.alloc(maxEncryptedLength));

        // Initialize HMAC
        const hmacMechanism = {
          mechanism: pkcs11js.CKM_SHA256_HMAC
        };

        pkcs11.C_SignInit(sessionHandle, hmacMechanism, hmacKey);

        // Sign the IV and encrypted data
        pkcs11.C_SignUpdate(sessionHandle, iv);
        pkcs11.C_SignUpdate(sessionHandle, encryptedData);

        // Get the HMAC
        const hmac = Buffer.alloc(HMAC_SIZE);
        pkcs11.C_SignFinal(sessionHandle, hmac);

        // Combine encrypted data and HMAC [Encrypted Data | HMAC]
        const finalBuffer = Buffer.alloc(encryptedData.length + hmac.length);
        encryptedData.copy(finalBuffer);
        hmac.copy(finalBuffer, encryptedData.length);

        return Buffer.concat([iv, finalBuffer]);
      } catch (error) {
        logger.error(error, "HSM: Failed to perform encryption");
        throw new Error(`HSM: Encryption failed: ${(error as Error)?.message}`);
      }
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
      try {
        // structure is: [IV (16 bytes) | Encrypted Data (N bytes) | HMAC (32 bytes)]
        const iv = encryptedBlob.subarray(0, IV_LENGTH);
        const encryptedDataWithHmac = encryptedBlob.subarray(IV_LENGTH);

        // Split encrypted data and HMAC
        const hmac = encryptedDataWithHmac.subarray(-HMAC_SIZE); // Last 32 bytes are HMAC

        const encryptedData = encryptedDataWithHmac.subarray(0, -HMAC_SIZE); // Everything except last 32 bytes

        // Find the keys
        const aesKey = $findKey(sessionHandle, HsmKeyType.AES);
        if (!aesKey) {
          throw new Error("HSM: Decryption failed, AES key not found");
        }

        const hmacKey = $findKey(sessionHandle, HsmKeyType.HMAC);
        if (!hmacKey) {
          throw new Error("HSM: Decryption failed, HMAC key not found");
        }

        // Verify HMAC first
        const hmacMechanism = {
          mechanism: pkcs11js.CKM_SHA256_HMAC
        };

        pkcs11.C_VerifyInit(sessionHandle, hmacMechanism, hmacKey);
        pkcs11.C_VerifyUpdate(sessionHandle, iv);
        pkcs11.C_VerifyUpdate(sessionHandle, encryptedData);

        try {
          pkcs11.C_VerifyFinal(sessionHandle, hmac);
        } catch (error) {
          logger.error(error, "HSM: HMAC verification failed");
          throw new Error("HSM: Decryption failed"); // Generic error for failed verification
        }

        // Only decrypt if verification passed
        const decryptMechanism = {
          mechanism: pkcs11js.CKM_AES_CBC_PAD,
          parameter: iv
        };

        pkcs11.C_DecryptInit(sessionHandle, decryptMechanism, aesKey);

        const tempBuffer: Buffer = Buffer.alloc(encryptedData.length);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const decryptedData = pkcs11.C_Decrypt(sessionHandle, encryptedData, tempBuffer);

        return Buffer.from(decryptedData);
      } catch (error) {
        logger.error(error, "HSM: Failed to perform decryption");
        throw new Error("HSM: Decryption failed"); // Generic error for failed decryption, to avoid leaking details about why it failed (such as padding related errors)
      }
    };

    if (providedSession) {
      return $performDecryption(providedSession);
    }

    const result = await $withSession($performDecryption);
    return result;
  };

  // We test the core functionality of the PKCS#11 module that we are using throughout Infisical. This is to ensure that the user doesn't configure a faulty or unsupported HSM device.
  const $testPkcs11Module = async (session: pkcs11js.Handle) => {
    try {
      if (!pkcs11 || !isInitialized) {
        throw new Error("PKCS#11 module is not initialized");
      }

      if (!session) {
        throw new Error("HSM: Attempted to run test without a valid session");
      }

      const randomData = pkcs11.C_GenerateRandom(session, Buffer.alloc(500));

      const encryptedData = await encrypt(randomData, session);
      const decryptedData = await decrypt(encryptedData, session);

      const randomDataHex = randomData.toString("hex");
      const decryptedDataHex = decryptedData.toString("hex");

      if (randomDataHex !== decryptedDataHex && Buffer.compare(randomData, decryptedData)) {
        throw new Error("HSM: Startup test failed. Decrypted data does not match original data");
      }

      return true;
    } catch (error) {
      logger.error(error, "HSM: Error testing PKCS#11 module");
      return false;
    }
  };

  const isActive = async () => {
    if (!isInitialized || !envConfig.isHsmConfigured) {
      return false;
    }

    let pkcs11TestPassed = false;

    try {
      pkcs11TestPassed = await $withSession($testPkcs11Module);
    } catch (err) {
      logger.error(err, "HSM: Error testing PKCS#11 module");
    }

    return envConfig.isHsmConfigured && isInitialized && pkcs11TestPassed;
  };

  const startService = async () => {
    if (!envConfig.isHsmConfigured || !pkcs11 || !isInitialized) return;

    try {
      await $withSession(async (sessionHandle) => {
        // Check if master key exists, create if not

        const genericAttributes = [
          { type: pkcs11js.CKA_TOKEN, value: true }, // Persistent storage
          { type: pkcs11js.CKA_EXTRACTABLE, value: false }, // Cannot be extracted
          { type: pkcs11js.CKA_SENSITIVE, value: true }, // Sensitive value
          { type: pkcs11js.CKA_PRIVATE, value: true } // Requires authentication
        ];

        if (!$keyExists(sessionHandle, HsmKeyType.AES)) {
          // Template for generating 256-bit AES master key
          const keyTemplate = [
            { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_SECRET_KEY },
            { type: pkcs11js.CKA_KEY_TYPE, value: pkcs11js.CKK_AES },
            { type: pkcs11js.CKA_VALUE_LEN, value: AES_KEY_SIZE / 8 },
            { type: pkcs11js.CKA_LABEL, value: envConfig.HSM_KEY_LABEL! },
            { type: pkcs11js.CKA_ENCRYPT, value: true }, // Allow encryption
            { type: pkcs11js.CKA_DECRYPT, value: true }, // Allow decryption
            ...genericAttributes
          ];

          // Generate the key
          pkcs11.C_GenerateKey(
            sessionHandle,
            {
              mechanism: pkcs11js.CKM_AES_KEY_GEN
            },
            keyTemplate
          );

          logger.info(`HSM: Master key created successfully with label: ${envConfig.HSM_KEY_LABEL}`);
        }

        // Check if HMAC key exists, create if not
        if (!$keyExists(sessionHandle, HsmKeyType.HMAC)) {
          const hmacKeyTemplate = [
            { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_SECRET_KEY },
            { type: pkcs11js.CKA_KEY_TYPE, value: pkcs11js.CKK_GENERIC_SECRET },
            { type: pkcs11js.CKA_VALUE_LEN, value: HMAC_KEY_SIZE / 8 }, // 256-bit key
            { type: pkcs11js.CKA_LABEL, value: `${envConfig.HSM_KEY_LABEL!}_HMAC` },
            { type: pkcs11js.CKA_SIGN, value: true }, // Allow signing
            { type: pkcs11js.CKA_VERIFY, value: true }, // Allow verification
            ...genericAttributes
          ];

          // Generate the HMAC key
          pkcs11.C_GenerateKey(
            sessionHandle,
            {
              mechanism: pkcs11js.CKM_GENERIC_SECRET_KEY_GEN
            },
            hmacKeyTemplate
          );

          logger.info(`HSM: HMAC key created successfully with label: ${envConfig.HSM_KEY_LABEL}_HMAC`);
        }

        // Get slot info to check supported mechanisms
        const slotId = pkcs11.C_GetSessionInfo(sessionHandle).slotID;
        const mechanisms = pkcs11.C_GetMechanismList(slotId);

        // Check for AES CBC PAD support
        const hasAesCbc = mechanisms.includes(pkcs11js.CKM_AES_CBC_PAD);

        if (!hasAesCbc) {
          throw new Error(`Required mechanism CKM_AEC_CBC_PAD not supported by HSM`);
        }

        // Run test encryption/decryption
        const testPassed = await $testPkcs11Module(sessionHandle);

        if (!testPassed) {
          throw new Error("PKCS#11 module test failed. Please ensure that the HSM is correctly configured.");
        }
      });
    } catch (error) {
      logger.error(error, "HSM: Error initializing HSM service:");
      throw error;
    }
  };

  return {
    encrypt,
    startService,
    isActive,
    decrypt
  };
};
