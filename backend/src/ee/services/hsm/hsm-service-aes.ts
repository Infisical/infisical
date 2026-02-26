import pkcs11js from "pkcs11js";

import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { HsmKeyType, HsmEncryptionProvider } from "./hsm-types";

// Constants for AES encryption
const IV_LENGTH = 16; // Luna HSM typically expects 16-byte IV for cbc
const BLOCK_SIZE = 16;
const HMAC_SIZE = 32;
const AES_KEY_SIZE = 256;
const HMAC_KEY_SIZE = 256;

type AesServiceDeps = {
  pkcs11: pkcs11js.PKCS11;
  envConfig: Pick<TEnvConfig, "HSM_KEY_LABEL">;
};

export const aesEncryptionProvider = ({ pkcs11, envConfig }: AesServiceDeps): HsmEncryptionProvider => {
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

  const initializeKeys = (sessionHandle: pkcs11js.Handle) => {
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
        { type: pkcs11js.CKA_LABEL, value: envConfig.HSM_KEY_LABEL },
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

      logger.info(`HSM: Master AES key created successfully with label: ${envConfig.HSM_KEY_LABEL}`);
    }

    // Check if HMAC key exists, create if not
    if (!$keyExists(sessionHandle, HsmKeyType.HMAC)) {
      const hmacKeyTemplate = [
        { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_SECRET_KEY },
        { type: pkcs11js.CKA_KEY_TYPE, value: pkcs11js.CKK_GENERIC_SECRET },
        { type: pkcs11js.CKA_VALUE_LEN, value: HMAC_KEY_SIZE / 8 }, // 256-bit key
        { type: pkcs11js.CKA_LABEL, value: `${envConfig.HSM_KEY_LABEL}_HMAC` },
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
  };

  const encrypt = (data: Buffer, sessionHandle: pkcs11js.Handle): Buffer => {
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

  const decrypt = (encryptedBlob: Buffer, sessionHandle: pkcs11js.Handle): Buffer => {
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

  const testEncryptionDecryption = (sessionHandle: pkcs11js.Handle): boolean => {
    try {
      const randomData = pkcs11.C_GenerateRandom(sessionHandle, Buffer.alloc(500));
      const encryptedData = encrypt(randomData, sessionHandle);
      const decryptedData = decrypt(encryptedData, sessionHandle);

      const randomDataHex = randomData.toString("hex");
      const decryptedDataHex = decryptedData.toString("hex");

      if (randomDataHex !== decryptedDataHex && Buffer.compare(randomData, decryptedData)) {
        throw new Error("HSM: Startup test failed. Decrypted data does not match original data");
      }

      return true;
    } catch (error) {
      logger.error(error, "HSM: Error testing AES encryption/decryption");
      return false;
    }
  };

  return {
    initializeKeys,
    encrypt,
    decrypt,
    testEncryptionDecryption
  };
};
