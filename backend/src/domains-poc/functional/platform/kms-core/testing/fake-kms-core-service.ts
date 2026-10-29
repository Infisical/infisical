import { TKmsCoreService } from "../contract";

export const createFakeKmsCoreService = (): TKmsCoreService => ({
  encryptWithOrgKey: async ({ orgId, plaintext }) => Buffer.concat([Buffer.from(`${orgId}:`), plaintext]),
  decryptWithOrgKey: async ({ orgId, ciphertext }) => ciphertext.subarray(Buffer.byteLength(`${orgId}:`))
});
