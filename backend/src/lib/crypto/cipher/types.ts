export enum SymmetricEncryption {
  AES_GCM_256 = "aes-256-gcm",
  AES_GCM_128 = "aes-128-gcm"
}

export type TSymmetricEncryptionFns = {
  encrypt: (text: Buffer, key: Buffer) => Buffer;
  decrypt: (blob: Buffer, key: Buffer) => Buffer;
};
