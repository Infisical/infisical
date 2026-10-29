import { TDecryptWithOrgKeyInput, TEncryptWithOrgKeyInput, TKmsCoreService } from "../contract";

export class FakeKmsCoreService implements TKmsCoreService {
  readonly calls: { method: "encrypt" | "decrypt"; orgId: string }[] = [];

  async encryptWithOrgKey({ orgId, plaintext }: TEncryptWithOrgKeyInput) {
    this.calls.push({ method: "encrypt", orgId });
    return Buffer.concat([Buffer.from(`${orgId}:`), plaintext]);
  }

  async decryptWithOrgKey({ orgId, ciphertext }: TDecryptWithOrgKeyInput) {
    this.calls.push({ method: "decrypt", orgId });
    return ciphertext.subarray(Buffer.byteLength(`${orgId}:`));
  }
}
