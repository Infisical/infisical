import { randomUUID } from "node:crypto";

export type TExternalKeyConfigRecord = {
  id: string;
  provider: string;
  // Encrypted with the org data key of the key's org.
  encryptedProviderInputs: Buffer;
  providerInputsVersion: number;
  status: string | null;
  statusDetails: string | null;
};

// What the provider client gets. The inputs are still encrypted.
export type TExternalKeyRef = {
  kmsKeyId: string;
  orgId: string;
  provider: string;
  encryptedProviderInputs: Buffer;
  providerInputsVersion: number;
};

export type TExternalKeyStatus = {
  id: string;
  provider: string;
  status: string | null;
  statusDetails: string | null;
};

export class ExternalKeyConfig {
  private constructor(
    readonly id: string,
    readonly provider: string,
    private readonly encryptedProviderInputs: Buffer,
    private readonly providerInputsVersion: number,
    private readonly status: string | null,
    private readonly statusDetails: string | null
  ) {}

  static create(input: {
    provider: string;
    encryptedProviderInputs: Buffer;
    providerInputsVersion: number;
  }): ExternalKeyConfig {
    return new ExternalKeyConfig(
      randomUUID(),
      input.provider,
      input.encryptedProviderInputs,
      input.providerInputsVersion,
      null,
      null
    );
  }

  static restore(record: TExternalKeyConfigRecord): ExternalKeyConfig {
    return new ExternalKeyConfig(
      record.id,
      record.provider,
      record.encryptedProviderInputs,
      record.providerInputsVersion,
      record.status ?? null,
      record.statusDetails ?? null
    );
  }

  withInputs(encryptedProviderInputs: Buffer, providerInputsVersion: number): ExternalKeyConfig {
    return new ExternalKeyConfig(
      this.id,
      this.provider,
      encryptedProviderInputs,
      providerInputsVersion,
      this.status,
      this.statusDetails
    );
  }

  hasSameInputsAs(other: ExternalKeyConfig): boolean {
    return (
      this.id === other.id &&
      this.providerInputsVersion === other.providerInputsVersion &&
      this.encryptedProviderInputs.equals(other.encryptedProviderInputs)
    );
  }

  summary(): TExternalKeyStatus {
    return { id: this.id, provider: this.provider, status: this.status, statusDetails: this.statusDetails };
  }

  refFor(kmsKeyId: string, orgId: string): TExternalKeyRef {
    return {
      kmsKeyId,
      orgId,
      provider: this.provider,
      encryptedProviderInputs: this.encryptedProviderInputs,
      providerInputsVersion: this.providerInputsVersion
    };
  }

  toJSON(): TExternalKeyConfigRecord {
    return {
      id: this.id,
      provider: this.provider,
      encryptedProviderInputs: this.encryptedProviderInputs,
      providerInputsVersion: this.providerInputsVersion,
      status: this.status,
      statusDetails: this.statusDetails
    };
  }
}
