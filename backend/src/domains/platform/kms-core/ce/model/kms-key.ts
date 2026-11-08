import { randomUUID } from "node:crypto";

import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { HmacAlgorithm } from "@app/lib/crypto/hmac";
import { AsymmetricKeyAlgorithm } from "@app/lib/crypto/sign/types";
import { BadRequestError } from "@app/lib/errors";

import { KmsKeyVersion } from "./kms-key-version";

export enum KmsKeyUsage {
  ENCRYPT_DECRYPT = "encrypt-decrypt",
  SIGN_VERIFY = "sign-verify",
  GENERATE_VERIFY_MAC = "generate-verify-mac"
}

export type TKmsKeyAlgorithmName = SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm | HmacAlgorithm;

export type TInternalKeyMaterialProps = {
  id: string;
  // Wrapped with the root key. Never leaves the domain.
  encryptedKey: Buffer;
  encryptionAlgorithm: string;
  version: number;
};

export type TExternalKeyConfigProps = {
  id: string;
  provider: string;
  // Encrypted with the org data key of the key's org.
  encryptedProviderInputs: Buffer;
  status?: string | null;
  statusDetails?: string | null;
};

export type TKmsKeyProps = {
  id: string;
  name: string;
  description?: string | null;
  orgId: string;
  projectId?: string | null;
  keyUsage: string;
  isDisabled?: boolean | null;
  isReserved?: boolean | null;
  isExportable: boolean;
  hasDeleteProtection: boolean;
  kmipMetadata?: unknown;
  createdAt: Date;
  updatedAt: Date;
  internal?: TInternalKeyMaterialProps;
  external?: TExternalKeyConfigProps;
};

// The attributes of a key a caller may change; everything else is fixed at creation or changed by rotation.
export type TKmsKeyAttributes = Partial<
  Pick<TKmsKeyProps, "name" | "description" | "isDisabled" | "hasDeleteProtection" | "isExportable" | "kmipMetadata">
>;

// The key's public shape: kms_keys columns, without key material.
export type TKmsKeyRecord = Omit<TKmsKeyProps, "internal" | "external">;

// A key in kms_keys with either internal material (internal_kms) or an external provider config (external_kms).
export class KmsKey {
  private constructor(private props: TKmsKeyProps) {}

  static restore(props: TKmsKeyProps): KmsKey {
    return new KmsKey(props);
  }

  static createInternal(input: {
    orgId: string;
    projectId?: string | null;
    name: string;
    description?: string | null;
    keyUsage: KmsKeyUsage;
    encryptionAlgorithm: TKmsKeyAlgorithmName;
    encryptedKey: Buffer;
    isReserved: boolean;
    isExportable: boolean;
    hasDeleteProtection: boolean;
    kmipMetadata?: Record<string, unknown> | null;
  }): KmsKey {
    KmsKey.assertAlgorithmFits(input.keyUsage, input.encryptionAlgorithm);
    const now = new Date();
    return new KmsKey({
      id: randomUUID(),
      name: input.name,
      description: input.description ?? null,
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      keyUsage: input.keyUsage,
      isDisabled: false,
      isReserved: input.isReserved,
      isExportable: input.isExportable,
      hasDeleteProtection: input.hasDeleteProtection,
      kmipMetadata: input.kmipMetadata ?? null,
      createdAt: now,
      updatedAt: now,
      internal: {
        id: randomUUID(),
        encryptedKey: input.encryptedKey,
        encryptionAlgorithm: input.encryptionAlgorithm,
        version: 1
      }
    });
  }

  static createExternal(input: {
    orgId: string;
    name: string;
    description?: string | null;
    provider: string;
    encryptedProviderInputs: Buffer;
  }): KmsKey {
    const now = new Date();
    return new KmsKey({
      id: randomUUID(),
      name: input.name,
      description: input.description ?? null,
      orgId: input.orgId,
      projectId: null,
      keyUsage: KmsKeyUsage.ENCRYPT_DECRYPT,
      isDisabled: false,
      isReserved: false,
      isExportable: true,
      hasDeleteProtection: false,
      kmipMetadata: null,
      createdAt: now,
      updatedAt: now,
      external: { id: randomUUID(), provider: input.provider, encryptedProviderInputs: input.encryptedProviderInputs }
    });
  }

  // Refuses an algorithm the key usage cannot use, and an unknown usage.
  static assertAlgorithmFits(keyUsage: KmsKeyUsage, algorithm: TKmsKeyAlgorithmName, forceType?: KmsKeyUsage) {
    if (forceType && keyUsage !== forceType) {
      throw new BadRequestError({
        message: `Unsupported key type, expected ${forceType} but got ${keyUsage}`
      });
    }

    if (keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT) {
      if (!Object.values(SymmetricKeyAlgorithm).includes(algorithm as SymmetricKeyAlgorithm)) {
        throw new BadRequestError({
          message: `Unsupported encryption algorithm for encrypt/decrypt key: ${algorithm as string}`
        });
      }
      return;
    }

    if (keyUsage === KmsKeyUsage.SIGN_VERIFY) {
      if (!Object.values(AsymmetricKeyAlgorithm).includes(algorithm as AsymmetricKeyAlgorithm)) {
        throw new BadRequestError({
          message: `Unsupported sign/verify algorithm for sign/verify key: ${algorithm as string}`
        });
      }
      return;
    }

    if (keyUsage === KmsKeyUsage.GENERATE_VERIFY_MAC) {
      if (!Object.values(HmacAlgorithm).includes(algorithm as HmacAlgorithm)) {
        throw new BadRequestError({
          message: `Unsupported HMAC algorithm for generate/verify MAC key: ${algorithm as string}`
        });
      }
      return;
    }

    throw new BadRequestError({ message: `Unsupported key type: ${keyUsage as string}` });
  }

  static symmetricKeyLength(algorithm: SymmetricKeyAlgorithm): number {
    switch (algorithm) {
      case SymmetricKeyAlgorithm.AES_GCM_128:
        return 16;
      case SymmetricKeyAlgorithm.AES_GCM_256:
      default:
        return 32;
    }
  }

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get orgId(): string {
    return this.props.orgId;
  }

  get projectId(): string | null {
    return this.props.projectId ?? null;
  }

  get keyUsage(): KmsKeyUsage {
    return this.props.keyUsage as KmsKeyUsage;
  }

  get isExternal(): boolean {
    return Boolean(this.props.external);
  }

  get isReserved(): boolean {
    return Boolean(this.props.isReserved);
  }

  get isDisabled(): boolean {
    return Boolean(this.props.isDisabled);
  }

  get hasDeleteProtection(): boolean {
    return Boolean(this.props.hasDeleteProtection);
  }

  get internal(): TInternalKeyMaterialProps | undefined {
    return this.props.internal;
  }

  get external(): TExternalKeyConfigProps | undefined {
    return this.props.external;
  }

  get encryptionAlgorithm(): TKmsKeyAlgorithmName | undefined {
    return this.props.internal?.encryptionAlgorithm as TKmsKeyAlgorithmName | undefined;
  }

  get version(): number | undefined {
    return this.props.internal?.version;
  }

  // The internal material, after checking the key is used the way the caller needs.
  materialFor(forceType: KmsKeyUsage): TInternalKeyMaterialProps {
    const { internal } = this.props;
    KmsKey.assertAlgorithmFits(this.keyUsage, internal?.encryptionAlgorithm as TKmsKeyAlgorithmName, forceType);
    if (!internal) throw new BadRequestError({ message: `KMS with ID '${this.id}' has no key material` });
    return internal;
  }

  assertRotatable() {
    if (this.isExternal) {
      throw new BadRequestError({
        message: "Cannot rotate external KMS keys from Infisical. Rotate the key in your external provider instead."
      });
    }
    if (this.isReserved) {
      throw new BadRequestError({ message: "Reserved Infisical-managed KMS keys cannot be rotated." });
    }
    if (this.isDisabled) {
      throw new BadRequestError({ message: "Key is disabled" });
    }
    if (this.keyUsage !== KmsKeyUsage.ENCRYPT_DECRYPT) {
      throw new BadRequestError({
        message:
          "Only encrypt-decrypt keys support rotation. To rotate a sign-verify or MAC key, create a new key and update your applications to use it."
      });
    }
  }

  // `suffix` names the key in a bulk export, where one refusal stops the whole batch.
  assertExportable(suffix = "") {
    if (this.isReserved) throw new BadRequestError({ message: `Cannot get key material for reserved key${suffix}` });
    if (this.isExternal) throw new BadRequestError({ message: `Cannot get key material for external key${suffix}` });
    if (!this.props.isExportable) {
      throw new BadRequestError({ message: `You are not allowed to export this key${suffix}` });
    }
  }

  // Archives the current material as a version and installs the new material as the next version.
  rotate(newEncryptedKey: Buffer): KmsKeyVersion {
    const { internal } = this.props;
    if (!internal) throw new BadRequestError({ message: `Internal KMS not found for KMS with ID '${this.id}'` });
    const archived = KmsKeyVersion.create({
      internalKmsId: internal.id,
      encryptedKey: internal.encryptedKey,
      version: internal.version
    });
    this.props = {
      ...this.props,
      internal: { ...internal, encryptedKey: newEncryptedKey, version: internal.version + 1 }
    };
    return archived;
  }

  updateAttributes(attributes: TKmsKeyAttributes) {
    const defined = Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== undefined));
    this.props = { ...this.props, ...defined, updatedAt: new Date() };
  }

  updateExternalConfig(encryptedProviderInputs: Buffer) {
    if (!this.props.external) throw new BadRequestError({ message: `KMS with ID '${this.id}' is not external` });
    this.props = {
      ...this.props,
      external: { ...this.props.external, encryptedProviderInputs },
      updatedAt: new Date()
    };
  }

  toRecord(): TKmsKeyRecord {
    const { internal, external, ...record } = this.props;
    return record;
  }

  toJSON(): TKmsKeyProps {
    return this.props;
  }
}
