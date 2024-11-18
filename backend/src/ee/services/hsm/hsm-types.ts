import pkcs11js from "pkcs11js";

export type HsmModule = {
  pkcs11: pkcs11js.PKCS11;
  isInitialized: boolean;
};

export enum HsmKeyType {
  AES = "AES",
  HMAC = "hmac"
}
