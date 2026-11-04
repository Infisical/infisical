import { keyCipher } from "../../service/org-key";

export interface TExternalKeyProvider {
  readonly name: string;
  encrypt(plaintext: Buffer): Promise<Buffer>;
  decrypt(ciphertext: Buffer): Promise<Buffer>;
}

export class PocExternalKeyProvider implements TExternalKeyProvider {
  readonly name = "poc";

  constructor(private readonly providerKey: Buffer) {}

  async encrypt(plaintext: Buffer) {
    return keyCipher.encrypt(plaintext, this.providerKey);
  }

  async decrypt(ciphertext: Buffer) {
    return keyCipher.decrypt(ciphertext, this.providerKey);
  }
}
