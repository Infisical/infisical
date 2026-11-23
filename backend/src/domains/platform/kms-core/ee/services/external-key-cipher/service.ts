import { KmsProviders } from "@app/ee/services/external-kms/providers/model";

import { TCipherPair } from "../../../ce/models/data-key";
import { TExternalKeyRef } from "../../../ce/models/external-key-config";
import { TExternalKmsHook, TInfisicalIdLookup } from "../../../ce/services/dependencies";
import { AwsProviderInputs } from "../../models/aws-provider-inputs";
import { TExternalKmsProviders } from "../dependencies";
import { assertAwsInputsAllowed } from "../helpers/assert-aws-inputs-allowed";
import { openProviderInputs } from "../helpers/provider-inputs";

// What KMS Core calls when a data key sits behind AWS or GCP. Built before KMS Core, so it holds nothing of it: the
// org data-key cipher arrives with each call.
export class ExternalKeyCipherService implements TExternalKmsHook {
  constructor(private readonly providers: TExternalKmsProviders) {}

  // eslint-disable-next-line class-methods-use-this
  async assertInputsAllowed(ref: TExternalKeyRef, orgCipher: TCipherPair, idLookup: TInfisicalIdLookup): Promise<void> {
    const opened = openProviderInputs(ref, orgCipher);
    if (opened.type !== KmsProviders.Aws) return;
    await assertAwsInputsAllowed(
      AwsProviderInputs.restore({ orgId: ref.orgId, inputs: opened.inputs, version: ref.providerInputsVersion }),
      idLookup
    );
  }

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

  // Legacy inputs go out as stored: assertInputsAllowed has refused the ones that name another organization.
  private client(ref: TExternalKeyRef, orgCipher: TCipherPair) {
    const opened = openProviderInputs(ref, orgCipher);
    if (opened.type === KmsProviders.Gcp) return this.providers.gcp({ inputs: opened.inputs });
    const awsInputs = AwsProviderInputs.restore({
      orgId: ref.orgId,
      inputs: opened.inputs,
      version: ref.providerInputsVersion
    });
    return this.providers.aws({ inputs: awsInputs.toProviderInputs() });
  }
}
