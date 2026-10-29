export type TEncryptWithOrgKeyInput = {
  orgId: string;
  plaintext: Buffer;
};

export type TDecryptWithOrgKeyInput = {
  orgId: string;
  ciphertext: Buffer;
};

export interface TKmsCoreService {
  encryptWithOrgKey(input: TEncryptWithOrgKeyInput): Promise<Buffer>;
  decryptWithOrgKey(input: TDecryptWithOrgKeyInput): Promise<Buffer>;
}
