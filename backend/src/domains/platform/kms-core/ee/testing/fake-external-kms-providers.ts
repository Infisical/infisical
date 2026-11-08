import { randomBytes } from "node:crypto";

import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";

import { TExternalKmsProviders } from "../external-kms-client/external-kms-providers";

// Stands in for AWS and GCP: real AES-GCM under one key per fake, and a hook that runs on every provider call so a
// test can check what else is happening at that moment (an open transaction, say).
export class FakeExternalKmsProviders {
  readonly key = randomBytes(32);

  calls = 0;

  failValidation = false;

  onCall?: () => Promise<void>;

  readonly providers: TExternalKmsProviders;

  constructor() {
    const cipher = symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256);
    const client = (inputs: unknown) => ({
      validateConnection: async () => {
        await this.call();
        if (this.failValidation) throw new Error("connection refused");
        return true;
      },
      encrypt: async (data: Buffer) => {
        await this.call();
        return { encryptedBlob: cipher.encrypt(data, this.key) };
      },
      decrypt: async (blob: Buffer) => {
        await this.call();
        return { data: cipher.decrypt(blob, this.key) };
      },
      cleanup: async () => undefined,
      generateInputKmsKey: async () => inputs,
      getKeysList: async () => ({ keys: ["fake-key"] })
    });
    this.providers = {
      aws: (async ({ inputs }: { inputs: unknown }) => client(inputs)) as unknown as TExternalKmsProviders["aws"],
      gcp: (async ({ inputs }: { inputs: unknown }) => client(inputs)) as unknown as TExternalKmsProviders["gcp"]
    };
  }

  private async call() {
    this.calls += 1;
    if (this.onCall) await this.onCall();
  }
}
