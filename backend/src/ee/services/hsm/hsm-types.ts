import pkcs11js from "pkcs11js";

import { RootKeyEncryptionStrategy } from "@app/services/kms/kms-types";

export type HsmModule = {
  pkcs11: pkcs11js.PKCS11;
  isInitialized: boolean;
};

export enum HsmKeyType {
  AES = "AES",
  HMAC = "hmac"
}

export type THsmStatus = {
  rootKmsConfigEncryptionStrategy: RootKeyEncryptionStrategy | null;
  isHsmConfigured: boolean;
};
