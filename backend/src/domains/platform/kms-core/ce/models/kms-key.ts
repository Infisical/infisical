import { randomUUID } from "node:crypto";

import slugify from "@sindresorhus/slugify";

import { EntityNotFoundError, RuleViolationError, StateConflictError } from "@app/domains/lib/errors";
import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { HmacAlgorithm } from "@app/lib/crypto/hmac";
import { SigningAlgorithm } from "@app/lib/crypto/sign";

import { DataKey, TEncryptor } from "./data-key";
import {
  ExternalKeyConfig,
  TExternalKeyConfigRecord,
  TExternalKeyRef,
  TExternalKeyStatus
} from "./external-key-config";
import { InternalKeyMaterial, TInternalKeyMaterialRecord } from "./internal-key-material";
import { KeyMaterial, KmsKeyUsage, TKmsKeyAlgorithmName } from "./key-material";
import { KeyMaterialVersions } from "./key-material-versions";
import { KmsCiphertext } from "./kms-ciphertext";
import { KmsKeyVersion } from "./kms-key-version";
import { RootKey } from "./root-key";

// Defined beside the material that validates them, so the two files do not import each other.
export { KmsKeyUsage } from "./key-material";

export type TKmsKeyRecord = {
  id: string;
  name: string;
  description: string | null;
  orgId: string;
  projectId: string | null;
  keyUsage: string;
  isDisabled: boolean;
  isReserved: boolean;
  isExportable: boolean;
  hasDeleteProtection: boolean;
  isPublicKeyPublished: boolean;
  kmipMetadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  internal: TInternalKeyMaterialRecord | null;
  external: TExternalKeyConfigRecord | null;
};

export type TKmsKeyColumns = Omit<TKmsKeyRecord, "internal" | "external">;

// What callers outside the domain see: never the material.
export type TKmsKeyDetails = TKmsKeyColumns & {
  isExternal: boolean;
  encryptionAlgorithm?: string;
  version?: number;
};

export type TKeyDecryptor = (input: { cipherTextBlob: Buffer }) => Promise<Buffer<ArrayBuffer>>;

const NAME_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const GENERATED_NAME_LENGTH = 8;

const generatedName = () =>
  slugify(
    Array.from(crypto.randomBytes(GENERATED_NAME_LENGTH), (byte) => NAME_ALPHABET[byte % NAME_ALPHABET.length]).join("")
  );

export class KmsKey {
  private constructor(
    readonly id: string,
    private keyName: string,
    private keyDescription: string | null,
    readonly orgId: string,
    readonly projectId: string | null,
    readonly keyUsage: KmsKeyUsage,
    private disabled: boolean,
    readonly isReserved: boolean,
    private exportable: boolean,
    private deleteProtected: boolean,
    private publicKeyPublished: boolean,
    private kmipMetadata: unknown,
    readonly createdAt: Date,
    private modifiedAt: Date,
    private internal: InternalKeyMaterial | null,
    private external: ExternalKeyConfig | null
  ) {}

  static restore(record: TKmsKeyRecord): KmsKey {
    return new KmsKey(
      record.id,
      record.name,
      record.description,
      record.orgId,
      record.projectId,
      record.keyUsage as KmsKeyUsage,
      record.isDisabled,
      record.isReserved,
      record.isExportable,
      record.hasDeleteProtection,
      record.isPublicKeyPublished,
      record.kmipMetadata,
      record.createdAt,
      record.updatedAt,
      record.internal ? InternalKeyMaterial.restore(record.internal) : null,
      record.external ? ExternalKeyConfig.restore(record.external) : null
    );
  }

  // A key made without saying whether it's reserved is Infisical-managed.
  static createInternal(input: {
    orgId: string;
    projectId?: string | null;
    name?: string;
    description?: string | null;
    material: KeyMaterial;
    rootKey: RootKey;
    isReserved?: boolean;
    isExportable?: boolean;
    hasDeleteProtection?: boolean;
    isPublicKeyPublished?: boolean;
    kmipMetadata?: Record<string, unknown> | null;
  }): KmsKey {
    const now = new Date();
    return new KmsKey(
      randomUUID(),
      input.name ? slugify(input.name) : generatedName(),
      input.description ?? null,
      input.orgId,
      input.projectId ?? null,
      input.material.usage,
      false,
      input.isReserved ?? true,
      input.isExportable ?? true,
      input.hasDeleteProtection ?? false,
      input.isPublicKeyPublished ?? false,
      input.kmipMetadata ?? null,
      now,
      now,
      InternalKeyMaterial.create(input.material, input.rootKey),
      null
    );
  }

  // The key an org or project gets on first use.
  static createReserved(input: { orgId: string; rootKey: RootKey }): KmsKey {
    return KmsKey.createInternal({
      orgId: input.orgId,
      material: KeyMaterial.generateSymmetric(SymmetricKeyAlgorithm.AES_GCM_256),
      rootKey: input.rootKey,
      isReserved: true,
      isExportable: true,
      hasDeleteProtection: false
    });
  }

  static createExternal(input: {
    orgId: string;
    name?: string;
    description?: string | null;
    provider: string;
    encryptedProviderInputs: Buffer;
    providerInputsVersion: number;
  }): KmsKey {
    const now = new Date();
    return new KmsKey(
      randomUUID(),
      input.name ? slugify(input.name) : generatedName(),
      input.description ?? null,
      input.orgId,
      null,
      KmsKeyUsage.ENCRYPT_DECRYPT,
      false,
      false,
      true,
      false,
      false,
      null,
      now,
      now,
      null,
      ExternalKeyConfig.create({
        provider: input.provider,
        encryptedProviderInputs: input.encryptedProviderInputs,
        providerInputsVersion: input.providerInputsVersion
      })
    );
  }

  get name(): string {
    return this.keyName;
  }

  get description(): string | null {
    return this.keyDescription;
  }

  get isDisabled(): boolean {
    return this.disabled;
  }

  get hasDeleteProtection(): boolean {
    return this.deleteProtected;
  }

  get isPublicKeyPublished(): boolean {
    return this.publicKeyPublished;
  }

  get isExternal(): boolean {
    return this.external !== null;
  }

  get isInfisicalManaged(): boolean {
    return this.isReserved && !this.isExternal;
  }

  get encryptionAlgorithm(): TKmsKeyAlgorithmName | null {
    return this.internal?.algorithm ?? null;
  }

  get version(): number | null {
    return this.internal?.version ?? null;
  }

  // The id archived versions are stored under.
  get materialId(): string | null {
    return this.internal?.id ?? null;
  }

  // Null for an internal key: the caller then opens it with the key itself.
  externalRef(): TExternalKeyRef | null {
    return this.external?.refFor(this.id, this.orgId) ?? null;
  }

  externalStatus(): TExternalKeyStatus | null {
    return this.external?.summary() ?? null;
  }

  rename(name: string) {
    this.keyName = slugify(name);
    this.touch();
  }

  describe(description: string | null) {
    this.keyDescription = description;
    this.touch();
  }

  disable() {
    this.disabled = true;
    this.touch();
  }

  enable() {
    this.disabled = false;
    this.touch();
  }

  protect() {
    this.deleteProtected = true;
    this.touch();
  }

  unprotect() {
    this.deleteProtected = false;
    this.touch();
  }

  allowExport() {
    this.exportable = true;
    this.touch();
  }

  forbidExport() {
    this.exportable = false;
    this.touch();
  }

  publishPublicKey() {
    this.publicKeyPublished = true;
    this.touch();
  }

  unpublishPublicKey() {
    this.publicKeyPublished = false;
    this.touch();
  }

  setKmipMetadata(metadata: Record<string, unknown> | null) {
    this.kmipMetadata = metadata;
    this.touch();
  }

  replaceProviderInputs(encryptedProviderInputs: Buffer, providerInputsVersion: number, read: KmsKey) {
    if (!this.external) throw new RuleViolationError({ message: `KMS with ID '${this.id}' is not external` });
    if (!read.external || !this.external.hasSameInputsAs(read.external)) {
      throw new StateConflictError({
        message: "This external KMS was changed while your update was being saved. Reload it and try again."
      });
    }
    this.external = this.external.withInputs(encryptedProviderInputs, providerInputsVersion);
    this.touch();
  }

  // Ciphertext written under the old material stays readable only once the caller stores `archived`.
  rotate(rootKey: RootKey): { archived: KmsKeyVersion; version: number } {
    this.assertRotatable();
    if (!this.internal)
      throw new RuleViolationError({ message: `Internal KMS not found for KMS with ID '${this.id}'` });
    const archived = this.internal.archive();
    this.internal = this.internal.succeededBy(
      KeyMaterial.generateSymmetric(this.internal.algorithm as SymmetricKeyAlgorithm),
      rootKey
    );
    this.touch();
    return { archived, version: this.internal.version };
  }

  // Another org's key answers like a missing one, so ids do not reveal which tenant owns them.
  assertInOrg(orgId: string, message = "KMS ID does not belong in the organization.") {
    if (this.orgId !== orgId) throw new EntityNotFoundError({ message });
  }

  assertRotatable() {
    if (this.isExternal) {
      throw new RuleViolationError({
        message: "Cannot rotate external KMS keys from Infisical. Rotate the key in your external provider instead."
      });
    }
    if (this.isReserved) {
      throw new RuleViolationError({ message: "Reserved Infisical-managed KMS keys cannot be rotated." });
    }
    if (this.disabled) {
      throw new RuleViolationError({ message: "Key is disabled" });
    }
    if (this.keyUsage !== KmsKeyUsage.ENCRYPT_DECRYPT) {
      throw new RuleViolationError({
        message:
          "Only encrypt-decrypt keys support rotation. To rotate a sign-verify or MAC key, create a new key and update your applications to use it."
      });
    }
  }

  // `suffix` names the key in a bulk export, where one refusal stops the whole batch.
  assertExportable(suffix = "") {
    if (this.isReserved) throw new RuleViolationError({ message: `Cannot get key material for reserved key${suffix}` });
    if (this.isExternal) throw new RuleViolationError({ message: `Cannot get key material for external key${suffix}` });
    if (!this.exportable) throw new RuleViolationError({ message: `You are not allowed to export this key${suffix}` });
  }

  // Callers word the refusal for their own operation (delete, destroy), so they ask and throw themselves.
  get isDeletable(): boolean {
    return !this.deleteProtected;
  }

  exportMaterial(rootKey: RootKey, suffix = ""): Buffer {
    this.assertExportable(suffix);
    return this.requireInternal().open(rootKey, this.keyUsage).exportBytes();
  }

  encryptor(rootKey: RootKey): TEncryptor {
    const internal = this.requireInternal(KmsKeyUsage.ENCRYPT_DECRYPT);
    const material = internal.open(rootKey, this.keyUsage);
    const { version } = internal;
    return ({ plainText }) => ({ cipherTextBlob: KmsCiphertext.encodeForKey(material.encrypt(plainText), version) });
  }

  // `loadArchived` runs at most once, on the first miss, and its failure propagates: a database error is never a
  // failed decrypt.
  decryptor(rootKey: RootKey, loadArchived: () => Promise<readonly KmsKeyVersion[]>): TKeyDecryptor {
    let versions = KeyMaterialVersions.of(rootKey, this.requireInternal(KmsKeyUsage.ENCRYPT_DECRYPT));
    return async ({ cipherTextBlob }) => {
      const ciphertext = KmsCiphertext.decode(cipherTextBlob);
      const decrypted = versions.tryDecrypt(ciphertext);
      if (decrypted) return decrypted;
      if (!versions.hasArchived) versions = versions.withArchived(await loadArchived());
      return versions.decryptOrThrow(ciphertext);
    };
  }

  // `archived` is only needed when this key was rotated after it wrapped the data key.
  openDataKey(rootKey: RootKey, encryptedDataKey: Buffer, archived: readonly KmsKeyVersion[] = []): DataKey {
    const versions = KeyMaterialVersions.of(rootKey, this.requireInternal(KmsKeyUsage.ENCRYPT_DECRYPT), archived);
    return DataKey.fromBytes(versions.decryptOrThrow(KmsCiphertext.decode(encryptedDataKey)));
  }

  sealDataKey(rootKey: RootKey, dataKey: DataKey): Buffer {
    return this.encryptor(rootKey)({ plainText: dataKey.exportForWrapping() }).cipherTextBlob;
  }

  publicKey(rootKey: RootKey): Promise<Buffer> {
    this.requireInternal(KmsKeyUsage.SIGN_VERIFY);
    return this.openMaterial(rootKey).publicKey();
  }

  async sign(
    rootKey: RootKey,
    input: { data: Buffer; signingAlgorithm: SigningAlgorithm; isDigest: boolean }
  ): Promise<{ signature: Buffer; algorithm: SigningAlgorithm }> {
    this.requireInternal(KmsKeyUsage.SIGN_VERIFY);
    const signature = await this.openMaterial(rootKey).sign(input.data, input.signingAlgorithm, input.isDigest);
    return { signature, algorithm: input.signingAlgorithm };
  }

  async verify(
    rootKey: RootKey,
    input: { data: Buffer; signature: Buffer; signingAlgorithm: SigningAlgorithm; isDigest: boolean }
  ): Promise<{ signatureValid: boolean; algorithm: SigningAlgorithm }> {
    this.requireInternal(KmsKeyUsage.SIGN_VERIFY);
    const signatureValid = await this.openMaterial(rootKey).verify(
      input.data,
      input.signature,
      input.signingAlgorithm,
      input.isDigest
    );
    return { signatureValid, algorithm: input.signingAlgorithm };
  }

  generateMac(rootKey: RootKey, data: Buffer): { mac: Buffer; algorithm: HmacAlgorithm } {
    const internal = this.requireInternal(KmsKeyUsage.GENERATE_VERIFY_MAC);
    return {
      mac: this.openMaterial(rootKey).generateMac(data),
      algorithm: internal.algorithm as HmacAlgorithm
    };
  }

  verifyMac(rootKey: RootKey, data: Buffer, mac: Buffer): { macValid: boolean; algorithm: HmacAlgorithm } {
    const internal = this.requireInternal(KmsKeyUsage.GENERATE_VERIFY_MAC);
    return {
      macValid: this.openMaterial(rootKey).verifyMac(data, mac),
      algorithm: internal.algorithm as HmacAlgorithm
    };
  }

  columns(): TKmsKeyColumns {
    const { internal, external, ...columns } = this.toJSON();
    return columns;
  }

  details(): TKmsKeyDetails {
    return {
      ...this.columns(),
      isExternal: this.isExternal,
      encryptionAlgorithm: this.internal?.algorithm,
      version: this.internal?.version
    };
  }

  toJSON(): TKmsKeyRecord {
    return {
      id: this.id,
      name: this.keyName,
      description: this.keyDescription,
      orgId: this.orgId,
      projectId: this.projectId,
      keyUsage: this.keyUsage,
      isDisabled: this.disabled,
      isReserved: this.isReserved,
      isExportable: this.exportable,
      hasDeleteProtection: this.deleteProtected,
      isPublicKeyPublished: this.publicKeyPublished,
      kmipMetadata: this.kmipMetadata,
      createdAt: this.createdAt,
      updatedAt: this.modifiedAt,
      internal: this.internal?.toJSON() ?? null,
      external: this.external?.toJSON() ?? null
    };
  }

  // Usage is checked first so an external key asked to sign says it's the wrong kind of key, not that it has no
  // material.
  private requireInternal(forceType?: KmsKeyUsage): InternalKeyMaterial {
    KeyMaterial.assertAlgorithmFits(this.keyUsage, this.internal?.algorithm as TKmsKeyAlgorithmName, forceType);
    if (!this.internal) throw new RuleViolationError({ message: `KMS with ID '${this.id}' has no key material` });
    return this.internal;
  }

  // Unwrapped at use, so the material is not held for the life of a request.
  private openMaterial(rootKey: RootKey): KeyMaterial {
    return this.requireInternal().open(rootKey, this.keyUsage);
  }

  private touch() {
    this.modifiedAt = new Date();
  }
}
