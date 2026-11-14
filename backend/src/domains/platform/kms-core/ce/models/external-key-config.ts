import { randomUUID } from "node:crypto";

export type TExternalKeyConfigRecord = {
  id: string;
  provider: string;
  // Encrypted with the org data key of the key's org.
  encryptedProviderInputs: Buffer;
  status: string | null;
  statusDetails: string | null;
};

// An external key as the provider client sees it: the stored row and its provider inputs, still encrypted.
export type TExternalKeyRef = {
  kmsKeyId: string;
  orgId: string;
  provider: string;
  encryptedProviderInputs: Buffer;
};

// How a KMS key reaches its provider (external_kms): which provider, and the credentials and key reference it needs.
export class ExternalKeyConfig {
  private constructor(
    readonly id: string,
    readonly provider: string,
    private readonly encryptedProviderInputs: Buffer,
    private readonly status: string | null,
    private readonly statusDetails: string | null
  ) {}

  static create(input: { provider: string; encryptedProviderInputs: Buffer }): ExternalKeyConfig {
    return new ExternalKeyConfig(randomUUID(), input.provider, input.encryptedProviderInputs, null, null);
  }

  static restore(record: TExternalKeyConfigRecord): ExternalKeyConfig {
    return new ExternalKeyConfig(
      record.id,
      record.provider,
      record.encryptedProviderInputs,
      record.status ?? null,
      record.statusDetails ?? null
    );
  }

  withInputs(encryptedProviderInputs: Buffer): ExternalKeyConfig {
    return new ExternalKeyConfig(this.id, this.provider, encryptedProviderInputs, this.status, this.statusDetails);
  }

  refFor(kmsKeyId: string, orgId: string): TExternalKeyRef {
    return { kmsKeyId, orgId, provider: this.provider, encryptedProviderInputs: this.encryptedProviderInputs };
  }

  toJSON(): TExternalKeyConfigRecord {
    return {
      id: this.id,
      provider: this.provider,
      encryptedProviderInputs: this.encryptedProviderInputs,
      status: this.status,
      statusDetails: this.statusDetails
    };
  }
}
