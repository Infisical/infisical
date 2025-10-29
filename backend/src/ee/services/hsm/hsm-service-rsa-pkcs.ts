import pkcs11js from "pkcs11js";
import crypto from "crypto";

import { TEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { HsmEncryptionProvider } from "./hsm-types";

/**
 * RSA-PKCS Hybrid Encryption Provider for Nitrokey HSM 2
 *
 * Uses RSA-PKCS (via HSM private key) to protect AES encryption keys,
 * and AES-256-CBC (locally) for bulk data encryption.
 *
 * This architecture works around Nitrokey HSM 2 limitations:
 * - No AES key generation (so we generate AES locally)
 * - No RSA public-key encryption (C_Encrypt not supported)
 * - RSA-PKCS private-key decryption IS supported (C_Decrypt)
 *
 * Encryption flow:
 *   1. Generate random AES-256 key
 *   2. Encrypt data with AES-256-CBC locally
 *   3. Encrypt AES key with RSA public key locally
 *   4. Return: [IV_size | IV | Data_size | Encrypted Data | Key_size | Encrypted AES Key]
 *
 * Decryption flow:
 *   1. Parse blob: extract IV, encrypted data, encrypted AES key
 *   2. Use HSM C_Decrypt with RSA-PKCS to decrypt AES key
 *   3. Decrypt data with AES-256-CBC using recovered key
 *   4. Return: plaintext
 */

// Constants
const AES_KEY_SIZE = 32; // 256 bits
const IV_SIZE = 16; // AES block size
const RSA_CIPHERTEXT_SIZE = 256; // RSA-2048 output is 256 bytes

type RsaPkcsServiceDeps = {
  pkcs11: pkcs11js.PKCS11;
  envConfig: Pick<TEnvConfig, "HSM_KEY_LABEL">;
};

// Helper function to encode RSA public key to DER (SubjectPublicKeyInfo format)
const $buildRsaPublicKeyDer = (modulus: Buffer, exponent: Buffer): Buffer => {
  // DER encoding helper functions
  const encodeLength = (length: number): Buffer => {
    if (length < 128) {
      return Buffer.from([length]);
    }
    const lengthBytes: number[] = [];
    while (length > 0) {
      lengthBytes.unshift(length & 0xff);
      length >>= 8;
    }
    return Buffer.from([0x80 | lengthBytes.length, ...lengthBytes]);
  };

  const encodeTLV = (tag: number, value: Buffer): Buffer => {
    return Buffer.concat([Buffer.from([tag]), encodeLength(value.length), value]);
  };

  const encodeInteger = (value: Buffer): Buffer => {
    // Ensure positive integer by prepending 0x00 if high bit is set
    if (value[0] & 0x80) {
      return encodeTLV(0x02, Buffer.concat([Buffer.from([0x00]), value]));
    }
    return encodeTLV(0x02, value);
  };

  // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }
  const rsaPublicKeySeq = Buffer.concat([
    encodeInteger(modulus),
    encodeInteger(exponent),
  ]);
  const rsaPublicKey = encodeTLV(0x30, rsaPublicKeySeq);

  // BIT STRING containing the RSAPublicKey (with no unused bits)
  const bitString = Buffer.concat([Buffer.from([0x00]), rsaPublicKey]);
  const bitStringTLV = encodeTLV(0x03, bitString);

  // AlgorithmIdentifier for RSA (with NULL parameters)
  const oid_rsaEncryption = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]); // 1.2.840.113549.1.1.1
  const oidTLV = encodeTLV(0x06, oid_rsaEncryption);
  const nullTLV = encodeTLV(0x05, Buffer.alloc(0));
  const algIdSeq = Buffer.concat([oidTLV, nullTLV]);
  const algId = encodeTLV(0x30, algIdSeq);

  // SubjectPublicKeyInfo ::= SEQUENCE { algorithm AlgorithmIdentifier, subjectPublicKey BIT STRING }
  const spkiSeq = Buffer.concat([algId, bitStringTLV]);
  return encodeTLV(0x30, spkiSeq);
};

export const rsaPkcsEncryptionProvider = ({
  pkcs11,
  envConfig,
}: RsaPkcsServiceDeps): HsmEncryptionProvider => {
  // Cache the public key to avoid repeated extraction
  let cachedPublicKey: crypto.KeyObject | null = null;

  const $findKey = (sessionHandle: pkcs11js.Handle, isPublic: boolean = false) => {
    const keyClass = isPublic ? pkcs11js.CKO_PUBLIC_KEY : pkcs11js.CKO_PRIVATE_KEY;
    const template = [
      { type: pkcs11js.CKA_CLASS, value: keyClass },
      { type: pkcs11js.CKA_KEY_TYPE, value: pkcs11js.CKK_RSA },
      { type: pkcs11js.CKA_LABEL, value: envConfig.HSM_KEY_LABEL },
    ];

    try {
      pkcs11.C_FindObjectsInit(sessionHandle, template);

      try {
        const handles = pkcs11.C_FindObjects(sessionHandle, 1);

        if (handles.length > 0) {
          return handles[0];
        }
      } finally {
        pkcs11.C_FindObjectsFinal(sessionHandle);
      }
    } catch (error) {
      logger.debug(
        `Failed to find ${isPublic ? "public" : "private"} RSA key with label "${envConfig.HSM_KEY_LABEL}": ${
          (error as Error)?.message
        }`
      );
    }

    return null;
  };

  const $keyExists = (session: pkcs11js.Handle, isPublic: boolean = false): boolean => {
    try {
      const key = $findKey(session, isPublic);
      return !!key;
    } catch (error) {
      logger.error(error, "HSM: Failed while checking for HSM RSA key presence");

      if (error instanceof pkcs11js.Pkcs11Error) {
        if (error.code === pkcs11js.CKR_OBJECT_HANDLE_INVALID) {
          return false;
        }
      }

      return false;
    }
  };

  const $getPublicKeyForEncryption = (sessionHandle: pkcs11js.Handle): crypto.KeyObject => {
    // Return cached public key if available
    if (cachedPublicKey) {
      return cachedPublicKey;
    }

    // Find public key on HSM
    const pubKeyHandle = $findKey(sessionHandle, true);
    if (!pubKeyHandle) {
      throw new Error("HSM: Public key not found for encryption");
    }

    // Extract RSA public key components
    const attrs = pkcs11.C_GetAttributeValue(sessionHandle, pubKeyHandle, [
      { type: pkcs11js.CKA_MODULUS },
      { type: pkcs11js.CKA_PUBLIC_EXPONENT },
    ]);

    if (!attrs[0] || !attrs[1]) {
      throw new Error("HSM: Could not extract RSA public key components");
    }

    logger.debug(`HSM: Extracted RSA public key from HSM`);

    // Extract and encode the public key components from HSM
    const modulus = attrs[0].value as Buffer;
    const exponent = attrs[1].value as Buffer;

    // Build DER-encoded SubjectPublicKeyInfo for RSA public key
    // This is the standard format Node.js crypto.createPublicKey expects
    try {
      const derPublicKey = $buildRsaPublicKeyDer(modulus, exponent);
      const publicKeyObj = crypto.createPublicKey({
        key: derPublicKey,
        format: "der",
        type: "spki",
      });

      cachedPublicKey = publicKeyObj;
      logger.debug(`HSM: Successfully created PublicKey object from HSM components`);
      return publicKeyObj;
    } catch (error) {
      logger.error(error, `HSM: Failed to create PublicKey object from HSM components`);
      throw error;
    }
  };

  const initializeKeys = (sessionHandle: pkcs11js.Handle) => {
    // Check if RSA keypair already exists
    const privateKeyExists = $keyExists(sessionHandle, false);

    if (privateKeyExists) {
      logger.info(`HSM: RSA keypair already exists with label: ${envConfig.HSM_KEY_LABEL}`);

      // Pre-cache the public key
      try {
        $getPublicKeyForEncryption(sessionHandle);
      } catch (error) {
        logger.warn(`HSM: Could not pre-cache public key: ${(error as Error)?.message}`);
      }

      return;
    }

    // Try to generate a new RSA keypair
    try {
      const publicKeyTemplate = [
        { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PUBLIC_KEY },
        { type: pkcs11js.CKA_KEY_TYPE, value: pkcs11js.CKK_RSA },
        { type: pkcs11js.CKA_LABEL, value: envConfig.HSM_KEY_LABEL },
        { type: pkcs11js.CKA_TOKEN, value: true },
        { type: pkcs11js.CKA_ENCRYPT, value: true },
        { type: pkcs11js.CKA_VERIFY, value: true },
        { type: pkcs11js.CKA_MODULUS_BITS, value: 2048 },
        { type: pkcs11js.CKA_PUBLIC_EXPONENT, value: Buffer.from([0x01, 0x00, 0x01]) }, // 65537
      ];

      const privateKeyTemplate = [
        { type: pkcs11js.CKA_CLASS, value: pkcs11js.CKO_PRIVATE_KEY },
        { type: pkcs11js.CKA_KEY_TYPE, value: pkcs11js.CKK_RSA },
        { type: pkcs11js.CKA_LABEL, value: envConfig.HSM_KEY_LABEL },
        { type: pkcs11js.CKA_TOKEN, value: true },
        { type: pkcs11js.CKA_PRIVATE, value: true },
        { type: pkcs11js.CKA_SENSITIVE, value: true },
        { type: pkcs11js.CKA_DECRYPT, value: true },
        { type: pkcs11js.CKA_SIGN, value: true },
      ];

      // Generate RSA keypair (2048-bit)
      pkcs11.C_GenerateKeyPair(
        sessionHandle,
        {
          mechanism: pkcs11js.CKM_RSA_PKCS_KEY_PAIR_GEN,
          parameter: Buffer.from([0x00, 0x00, 0x08, 0x00]) // 2048-bit modulus
        },
        publicKeyTemplate,
        privateKeyTemplate
      );

      logger.info(
        `HSM: RSA-2048 keypair created successfully with label: ${envConfig.HSM_KEY_LABEL}`
      );

      // Pre-cache the public key
      $getPublicKeyForEncryption(sessionHandle);
    } catch (error) {
      logger.warn(
        `HSM: Failed to generate new RSA keypair: ${(error as Error)?.message}. ` +
          `Please pre-create an RSA-2048 keypair on your HSM with label "${envConfig.HSM_KEY_LABEL}" ` +
          `using your HSM's management tools (e.g., pkcs11-tool).`
      );
      throw error;
    }
  };

  const encrypt = (data: Buffer, sessionHandle: pkcs11js.Handle): Buffer => {
    try {
      // Step 1: Generate random AES-256 key
      const aesKey = crypto.randomBytes(AES_KEY_SIZE);

      // Step 2: Generate IV for AES-CBC
      const iv = crypto.randomBytes(IV_SIZE);

      // Step 3: Encrypt data with AES-256-CBC
      const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
      const encryptedData = Buffer.concat([cipher.update(data), cipher.final()]);

      // Step 4: Get public key and encrypt AES key with RSA-PKCS
      const publicKey = $getPublicKeyForEncryption(sessionHandle);

      // Use RSA-PKCS for encryption (PKCS#1 v1.5)
      const encryptedAesKey = crypto.publicEncrypt(
        {
          key: publicKey,
          padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        aesKey
      );

      // Step 5: Return structure
      // [IV_size(4) | IV | Data_size(4) | Data | Key_size(4) | EncryptedKey]
      const ivSizeBuffer = Buffer.alloc(4);
      ivSizeBuffer.writeUInt32BE(iv.length, 0);

      const dataSizeBuffer = Buffer.alloc(4);
      dataSizeBuffer.writeUInt32BE(encryptedData.length, 0);

      const keySizeBuffer = Buffer.alloc(4);
      keySizeBuffer.writeUInt32BE(encryptedAesKey.length, 0);

      return Buffer.concat([
        ivSizeBuffer,
        iv,
        dataSizeBuffer,
        encryptedData,
        keySizeBuffer,
        encryptedAesKey,
      ]);
    } catch (error) {
      logger.error(error, "HSM: Failed to perform RSA-PKCS hybrid encryption");
      throw new Error(`HSM: Encryption failed: ${(error as Error)?.message}`);
    }
  };

  const decrypt = (encryptedBlob: Buffer, sessionHandle: pkcs11js.Handle): Buffer => {
    try {
      // Step 1: Parse blob structure
      let offset = 0;

      const ivSize = encryptedBlob.readUInt32BE(offset);
      offset += 4;

      const iv = encryptedBlob.subarray(offset, offset + ivSize);
      offset += ivSize;

      const dataSize = encryptedBlob.readUInt32BE(offset);
      offset += 4;

      const encryptedData = encryptedBlob.subarray(offset, offset + dataSize);
      offset += dataSize;

      const keySize = encryptedBlob.readUInt32BE(offset);
      offset += 4;

      const encryptedAesKey = encryptedBlob.subarray(offset, offset + keySize);

      // Step 2: Use HSM to decrypt the AES key
      // This is where the security comes from - private key never leaves HSM
      const hsmPrivateKey = $findKey(sessionHandle, false);
      if (!hsmPrivateKey) {
        throw new Error("HSM: Private key not found for decryption");
      }

      // Use RSA-PKCS for decryption
      const mechanism = {
        mechanism: pkcs11js.CKM_RSA_PKCS,
      };

      pkcs11.C_DecryptInit(sessionHandle, mechanism, hsmPrivateKey);
      const decryptedKey = pkcs11.C_Decrypt(sessionHandle, encryptedAesKey, Buffer.alloc(AES_KEY_SIZE + 256));
      const aesKey = decryptedKey.slice(0, AES_KEY_SIZE);

      // Step 3: Decrypt data with recovered AES key
      const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
      const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

      return decrypted;
    } catch (error) {
      logger.error(error, "HSM: Failed to perform RSA-PKCS hybrid decryption");
      throw new Error("HSM: Decryption failed");
    }
  };

  const testEncryptionDecryption = (sessionHandle: pkcs11js.Handle): boolean => {
    try {
      const testData = Buffer.from("Test encryption with HSM-backed RSA-PKCS");
      const encrypted = encrypt(testData, sessionHandle);
      const decrypted = decrypt(encrypted, sessionHandle);

      if (!testData.equals(decrypted)) {
        throw new Error("Decrypted data does not match original");
      }

      return true;
    } catch (error) {
      logger.error(error, "HSM: Error testing RSA-PKCS hybrid encryption/decryption");
      return false;
    }
  };

  return {
    initializeKeys,
    encrypt,
    decrypt,
    testEncryptionDecryption,
  };
};
