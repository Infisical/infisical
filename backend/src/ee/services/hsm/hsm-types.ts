import pkcs11js from "pkcs11js";

import { RootKeyEncryptionStrategy } from "@app/services/kms/kms-types";

export type HsmModule = {
  pkcs11: pkcs11js.PKCS11;
  isInitialized: boolean;
};

export enum HsmKeyType {
  AES = "AES",
  HMAC = "hmac",
  ECDH = "ECDH"
}

export enum HsmEncryptionStrategy {
  AES = "AES",
  RSA_PKCS = "RSA_PKCS"
}

export type HsmEncryptionProvider = {
  initializeKeys(sessionHandle: pkcs11js.Handle): void;
  encrypt(data: Buffer, sessionHandle: pkcs11js.Handle): Buffer;
  decrypt(encryptedBlob: Buffer, sessionHandle: pkcs11js.Handle): Buffer;
  testEncryptionDecryption(sessionHandle: pkcs11js.Handle): boolean;
};

export type THsmStatus = {
  rootKmsConfigEncryptionStrategy: RootKeyEncryptionStrategy | null;
  isHsmConfigured: boolean;
};
