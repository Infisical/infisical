import { KmsProviders } from "@app/ee/services/external-kms/providers/model";

import { TCipherPair } from "../../../ce/models/data-key";
import { TExternalKeyRef } from "../../../ce/models/external-key-config";
import { TExternalKmsHook } from "../../../ce/services/dependencies";
import { TExternalKmsProviders } from "../dependencies";
import { openProviderInputs } from "../helpers/provider-inputs";

// What KMS Core calls when a data key sits behind AWS or GCP. Built before KMS Core, so it holds nothing of it: the
// org data-key cipher arrives with each call.
export class ExternalKeyCipherService implements TExternalKmsHook {
  constructor(private readonly providers: TExternalKmsProviders) {}

  async encrypt(ref: TExternalKeyRef, orgCipher: TCipherPair, plainText: Buffer): Promise<Buffer<ArrayBuffer>> {
    const client = await this.client(ref, orgCipher);
    try {
      return (await client.encrypt(plainText)).encryptedBlob;
    } finally {
      await client.cleanup();
    }
  }

  async decrypt(ref: TExternalKeyRef, orgCipher: TCipherPair, cipherTextBlob: Buffer): Promise<Buffer<ArrayBuffer>> {
    const client = await this.client(ref, orgCipher);
    try {
      return (await client.decrypt(cipherTextBlob)).data;
    } finally {
      await client.cleanup();
    }
  }

  private client(ref: TExternalKeyRef, orgCipher: TCipherPair) {
    const opened = openProviderInputs(ref, orgCipher);
    return opened.type === KmsProviders.Aws
      ? this.providers.aws({ inputs: opened.inputs })
      : this.providers.gcp({ inputs: opened.inputs });
  }
}
