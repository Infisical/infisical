import { ProjectType } from "@app/db/schemas";
import { ReadFrom, TReadOptions } from "@app/domains/lib/data-access";
import { EntityNotFoundError } from "@app/domains/lib/errors";
import { TTransaction, TTransactionRunner } from "@app/domains/lib/transactions";
import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { HmacAlgorithm } from "@app/lib/crypto/hmac";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { OrderByDirection } from "@app/lib/types";

import { KeyMaterial } from "../../models/key-material";
import { KmsKey, KmsKeyUsage, TKmsKeyDetails, TKmsKeyRecord } from "../../models/kms-key";
import { RootKey } from "../../models/root-key";
import { KmsDataKey, TKmsDataKeyService } from "../data-key/service";
import {
  TExternalKmsDetails,
  TExternalKmsHook,
  TExternalKmsSummary,
  TCreateExternalKmsInput,
  TKmsCoreStores,
  TKmsKeyFilter,
  TUpdateExternalKmsInput
} from "../dependencies";
import {
  existingOrgCipher,
  keyDecryptor,
  keyEncryptor,
  notFoundKey,
  requireExternalKms,
  requireKey,
  TAsyncDecryptor,
  TAsyncEncryptor
} from "../helpers/key-cipher";

export type { TKmsKeyDetails } from "../../models/kms-key";

export enum KmsKeyOrderBy {
  Name = "name"
}

export type TKmsKeyAlgorithm = SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm | HmacAlgorithm;

export type TGenerateKMSDTO = {
  orgId: string;
  projectId?: string;
  encryptionAlgorithm?: TKmsKeyAlgorithm;
  keyUsage?: KmsKeyUsage;
  isReserved?: boolean;
  isExportable?: boolean;
  hasDeleteProtection?: boolean;
  isPublicKeyPublished?: boolean;
  name?: string;
  description?: string;
};

export type TImportKeyMaterialDTO = {
  key: Buffer;
  algorithm: TKmsKeyAlgorithm;
  name?: string;
  isReserved: boolean;
  isExportable?: boolean;
  hasDeleteProtection?: boolean;
  projectId: string;
  orgId: string;
  keyUsage: KmsKeyUsage;
  kmipMetadata?: Record<string, unknown> | null;
};

export type TEncryptWithKmsDTO = { kmsId: string; plainText: Buffer };
export type TDecryptWithKmsDTO = { kmsId: string; cipherTextBlob: Buffer };

export type TSignWithKmsDTO = {
  kmsId: string;
  data: Buffer;
  signingAlgorithm: SigningAlgorithm;
  isDigest: boolean;
};

export type TVerifyWithKmsDTO = {
  kmsId: string;
  data: Buffer;
  signature: Buffer;
  signingAlgorithm: SigningAlgorithm;
  isDigest: boolean;
};

export type TGenerateMacDTO = { kmsId: string; data: Buffer };
export type TVerifyMacDTO = { kmsId: string; data: Buffer; mac: Buffer };

export type TListKmsKeysDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  orderBy?: KmsKeyOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export type TKmsKeyAttributes = {
  name?: string;
  description?: string | null;
  isDisabled?: boolean;
  hasDeleteProtection?: boolean;
  isExportable?: boolean;
  isPublicKeyPublished?: boolean;
  kmipMetadata?: Record<string, unknown> | null;
};

export type TUpdateKmsKeyAttributesDTO = TKmsKeyAttributes;

export type TKmsKeyService = {
  generateKmsKey(input: TGenerateKMSDTO): Promise<TKmsKeyRecord>;
  importKeyMaterial(input: TImportKeyMaterialDTO): Promise<TKmsKeyRecord>;
  rotateKmsKey(kmsId: string): Promise<{ id: string; version: number }>;
  getKmsById(kmsId: string): Promise<{ id: string; name: string; orgId: string; isExternal: boolean }>;
  findKeyById(kmsId: string): Promise<TKmsKeyDetails | undefined>;
  // Read from the primary: undefined when unpublished, missing, or its project is pending deletion.
  findPublishedKeyById(kmsId: string): Promise<TKmsKeyDetails | undefined>;
  findKeys(filter: TKmsKeyFilter, options?: TReadOptions): Promise<TKmsKeyDetails[]>;
  listProjectKeys(input: TListKmsKeysDTO): Promise<{ keys: TKmsKeyDetails[]; totalCount: number }>;
  updateKeyAttributes(kmsId: string, attributes: TKmsKeyAttributes): Promise<TKmsKeyDetails>;
  // Null when the key has delete protection.
  deleteKey(kmsId: string): Promise<TKmsKeyDetails | null>;
  deleteKeys(kmsIds: string[]): Promise<number>;
  countProjectKeysInOrg(orgId: string, projectType: ProjectType): Promise<number>;
  getKeyMaterial(input: { kmsId: string }): Promise<Buffer<ArrayBuffer>>;
  getBulkKeyMaterial(input: {
    kmsIds: string[];
  }): Promise<{ kmsId: string; name: string; keyMaterial: Buffer<ArrayBuffer> }[]>;

  encryptWithKmsKey(input: { kmsId: string }): Promise<TAsyncEncryptor>;
  decryptWithKmsKey(input: { kmsId: string }): Promise<TAsyncDecryptor>;
  getPublicKey(input: { kmsId: string }, options?: TReadOptions): Promise<Buffer>;
  signWithKmsKey(
    input: Pick<TSignWithKmsDTO, "kmsId">,
    options?: TReadOptions
  ): Promise<
    (input: Pick<TSignWithKmsDTO, "data" | "signingAlgorithm" | "isDigest">) => Promise<{
      signature: Buffer;
      algorithm: TSignWithKmsDTO["signingAlgorithm"];
    }>
  >;
  verifyWithKmsKey(input: Pick<TVerifyWithKmsDTO, "kmsId" | "signingAlgorithm">): Promise<
    (input: Pick<TVerifyWithKmsDTO, "data" | "signature" | "isDigest">) => Promise<{
      signatureValid: boolean;
      algorithm: TVerifyWithKmsDTO["signingAlgorithm"];
    }>
  >;
  generateMac(input: {
    kmsId: string;
  }): Promise<(input: { data: Buffer }) => { mac: Buffer; algorithm: HmacAlgorithm }>;
  verifyMac(input: {
    kmsId: string;
  }): Promise<(input: { data: Buffer; mac: Buffer }) => { macValid: boolean; algorithm: HmacAlgorithm }>;

  createExternalKms(input: TCreateExternalKmsInput): Promise<TExternalKmsDetails>;
  updateExternalKms(input: TUpdateExternalKmsInput): Promise<TExternalKmsDetails>;
  deleteExternalKms(kmsId: string): Promise<TExternalKmsDetails>;
  getExternalKms(kmsId: string): Promise<TExternalKmsDetails>;
  getExternalKmsByName(orgId: string, name: string): Promise<TExternalKmsDetails>;
  listExternalKms(orgId: string): Promise<TExternalKmsSummary[]>;
  fetchGcpKeys(input: { credential: unknown; gcpRegion: string }): Promise<{ keys: string[] }>;

  within(tx: TTransaction): TKmsKeyTransaction;
};

// The calls a caller can make inside its own transaction. The encryptor and decryptor they return stay usable after
// it ends. Any error leaves the caller's transaction unusable: roll it back.
export type TKmsKeyTransaction = Pick<TKmsKeyService, "encryptWithKmsKey" | "decryptWithKmsKey" | "getKmsById">;

export class KmsKeyService implements TKmsKeyService {
  constructor(
    private readonly transactionRunner: TTransactionRunner<TKmsCoreStores>,
    private readonly stores: TKmsCoreStores,
    private readonly rootKey: RootKey,
    private readonly externalKms: TExternalKmsHook | undefined,
    private readonly kmsDataKeyService: TKmsDataKeyService,
    // Set for a service bound to a caller's transaction.
    private readonly isJoined = false
  ) {}

  within(tx: TTransaction): TKmsKeyTransaction {
    const runner = this.transactionRunner.within(tx);
    const joined = <T>(work: (service: KmsKeyService) => Promise<T>) =>
      runner.run(({ stores }) =>
        work(new KmsKeyService(runner, stores, this.rootKey, this.externalKms, this.kmsDataKeyService, true))
      );
    return {
      encryptWithKmsKey: (input) => joined((service) => service.encryptWithKmsKey(input)),
      decryptWithKmsKey: (input) => joined((service) => service.decryptWithKmsKey(input)),
      getKmsById: (kmsId) => joined((service) => service.getKmsById(kmsId))
    };
  }

  async generateKmsKey({
    orgId,
    projectId,
    name,
    description,
    isReserved = true,
    isExportable = true,
    hasDeleteProtection = false,
    isPublicKeyPublished = false,
    encryptionAlgorithm = SymmetricKeyAlgorithm.AES_GCM_256,
    keyUsage = KmsKeyUsage.ENCRYPT_DECRYPT
  }: TGenerateKMSDTO) {
    const material = await KeyMaterial.generate(keyUsage, encryptionAlgorithm);
    const key = KmsKey.createInternal({
      orgId,
      projectId,
      name,
      description,
      material,
      rootKey: this.rootKey,
      isReserved,
      isExportable,
      hasDeleteProtection,
      isPublicKeyPublished
    });
    return this.insertKey(key);
  }

  async importKeyMaterial({
    key: bytes,
    algorithm,
    name,
    isReserved,
    isExportable = true,
    hasDeleteProtection = false,
    projectId,
    orgId,
    keyUsage,
    kmipMetadata
  }: TImportKeyMaterialDTO) {
    const material = await KeyMaterial.import(bytes, keyUsage, algorithm);
    const key = KmsKey.createInternal({
      orgId,
      projectId,
      name,
      material,
      rootKey: this.rootKey,
      isReserved,
      isExportable,
      hasDeleteProtection,
      kmipMetadata
    });
    return this.insertKey(key);
  }

  // Archives the current material and installs new material. Old ciphertext stays readable.
  rotateKmsKey(kmsId: string) {
    return this.transactionRunner.run(async ({ stores }) => {
      const key = await stores.kmsKeyStore.findForRotation(kmsId);
      if (!key) throw notFoundKey(kmsId);
      const archived = key.rotate(this.rootKey);
      await stores.kmsKeyVersionStore.insert(archived);
      await stores.kmsKeyStore.save(key);
      return { id: key.id, version: key.version as number };
    });
  }

  async getKmsById(kmsId: string) {
    const key = await requireKey(this.stores.kmsKeyStore, kmsId);
    return { id: key.id, name: key.name, orgId: key.orgId, isExternal: key.isExternal };
  }

  async findKeyById(kmsId: string) {
    const key = await this.stores.kmsKeyStore.findById(kmsId);
    return key?.details();
  }

  // Reads the primary: a lagging replica could still show a key that was just unpublished or disabled.
  async findPublishedKeyById(kmsId: string) {
    const key = await this.stores.kmsKeyStore.findPublishedById(kmsId, { readFrom: ReadFrom.Primary });
    return key?.details();
  }

  async findKeys(filter: TKmsKeyFilter, options?: TReadOptions) {
    const keys = await this.stores.kmsKeyStore.find(filter, options);
    return keys.map((key) => key.details());
  }

  async listProjectKeys({
    projectId,
    offset = 0,
    limit,
    orderDirection = OrderByDirection.ASC,
    search
  }: TListKmsKeysDTO) {
    const { keys, totalCount } = await this.stores.kmsKeyStore.listProjectKeys({
      projectId,
      offset,
      limit,
      orderBy: "name",
      orderDirection,
      search
    });
    return { keys: keys.map((key) => key.details()), totalCount };
  }

  updateKeyAttributes(kmsId: string, attributes: TKmsKeyAttributes) {
    return this.transactionRunner.run(async ({ stores }) => {
      const key = await stores.kmsKeyStore.findForUpdate(kmsId);
      if (!key) throw notFoundKey(kmsId);
      KmsKeyService.applyAttributes(key, attributes);
      await stores.kmsKeyStore.save(key);
      return key.details();
    });
  }

  deleteKey(kmsId: string) {
    return this.transactionRunner.run(async ({ stores }) => {
      const key = await stores.kmsKeyStore.findForUpdate(kmsId);
      if (!key) throw notFoundKey(kmsId);
      if (!key.isDeletable) return null;
      await stores.kmsKeyStore.delete(kmsId);
      return key.details();
    });
  }

  async deleteKeys(kmsIds: string[]) {
    if (!kmsIds.length) return 0;
    return this.transactionRunner.run(({ stores }) => stores.kmsKeyStore.deleteMany(kmsIds));
  }

  countProjectKeysInOrg(orgId: string, projectType: ProjectType) {
    return this.stores.kmsKeyStore.countProjectKeysInOrg(orgId, projectType);
  }

  async getKeyMaterial({ kmsId }: { kmsId: string }) {
    const key = await requireKey(this.stores.kmsKeyStore, kmsId);
    return Buffer.from(key.exportMaterial(this.rootKey));
  }

  async getBulkKeyMaterial({ kmsIds }: { kmsIds: string[] }) {
    const keys = await this.stores.kmsKeyStore.find({ ids: kmsIds });
    return keys.map((key) => ({
      kmsId: key.id,
      name: key.name,
      keyMaterial: Buffer.from(key.exportMaterial(this.rootKey, ` [kmsId=${key.id}]`))
    }));
  }

  async encryptWithKmsKey({ kmsId }: { kmsId: string }) {
    const key = await requireKey(this.stores.kmsKeyStore, kmsId);
    return keyEncryptor(this.stores, this.rootKey, this.externalKms, key);
  }

  async decryptWithKmsKey({ kmsId }: { kmsId: string }) {
    const key = await requireKey(this.stores.kmsKeyStore, kmsId);
    return keyDecryptor(this.stores, this.rootKey, this.externalKms, key, { loadArchivedNow: this.isJoined });
  }

  async getPublicKey({ kmsId }: { kmsId: string }, options?: TReadOptions) {
    const key = await requireKey(this.stores.kmsKeyStore, kmsId, options);
    return key.publicKey(this.rootKey);
  }

  async signWithKmsKey({ kmsId }: Pick<TSignWithKmsDTO, "kmsId">, options?: TReadOptions) {
    const key = await requireKey(this.stores.kmsKeyStore, kmsId, options);
    return ({ data, signingAlgorithm, isDigest }: Pick<TSignWithKmsDTO, "data" | "signingAlgorithm" | "isDigest">) =>
      key.sign(this.rootKey, { data, signingAlgorithm, isDigest });
  }

  async verifyWithKmsKey({ kmsId, signingAlgorithm }: Pick<TVerifyWithKmsDTO, "kmsId" | "signingAlgorithm">) {
    const key = await requireKey(this.stores.kmsKeyStore, kmsId);
    return ({ data, signature, isDigest }: Pick<TVerifyWithKmsDTO, "data" | "signature" | "isDigest">) =>
      key.verify(this.rootKey, { data, signature, signingAlgorithm, isDigest });
  }

  async generateMac({ kmsId }: { kmsId: string }) {
    const key = await requireKey(this.stores.kmsKeyStore, kmsId);
    return ({ data }: { data: Buffer }) => key.generateMac(this.rootKey, data);
  }

  async verifyMac({ kmsId }: { kmsId: string }) {
    const key = await requireKey(this.stores.kmsKeyStore, kmsId);
    return ({ data, mac }: { data: Buffer; mac: Buffer }) => key.verifyMac(this.rootKey, data, mac);
  }

  async createExternalKms(input: TCreateExternalKmsInput) {
    const provider = requireExternalKms(this.externalKms);
    const cipher = await this.kmsDataKeyService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: input.orgId
    });
    return provider.create(input, cipher);
  }

  async updateExternalKms(input: TUpdateExternalKmsInput) {
    const provider = requireExternalKms(this.externalKms);
    const cipher = await this.externalKeyCipher(input.kmsId);
    return provider.update(input, cipher);
  }

  async deleteExternalKms(kmsId: string) {
    const provider = requireExternalKms(this.externalKms);
    const cipher = await this.externalKeyCipher(kmsId);
    return provider.delete(kmsId, cipher);
  }

  async getExternalKms(kmsId: string) {
    const provider = requireExternalKms(this.externalKms);
    const cipher = await this.externalKeyCipher(kmsId);
    return provider.get(kmsId, cipher);
  }

  async getExternalKmsByName(orgId: string, name: string) {
    const provider = requireExternalKms(this.externalKms);
    const [key] = await this.stores.kmsKeyStore.find({ orgId, name });
    if (!key?.isExternal) throw new EntityNotFoundError({ message: `External KMS with name '${name}' not found` });
    const cipher = await existingOrgCipher(this.stores, this.rootKey, orgId);
    return provider.get(key.id, cipher);
  }

  async listExternalKms(orgId: string) {
    return requireExternalKms(this.externalKms).list(orgId);
  }

  async fetchGcpKeys(input: { credential: unknown; gcpRegion: string }) {
    return requireExternalKms(this.externalKms).fetchGcpKeys(input);
  }

  // A duplicate name in a project fails on the unique index; callers translate that DatabaseError into their own
  // message.
  private async insertKey(key: KmsKey): Promise<TKmsKeyRecord> {
    await this.stores.kmsKeyStore.insert(key);
    return key.toJSON();
  }

  private async externalKeyCipher(kmsId: string) {
    const key = await this.stores.kmsKeyStore.findById(kmsId);
    if (!key?.isExternal) throw new EntityNotFoundError({ message: `External KMS with ID '${kmsId}' not found` });
    return existingOrgCipher(this.stores, this.rootKey, key.orgId);
  }

  private static applyAttributes(key: KmsKey, attributes: TKmsKeyAttributes) {
    if (attributes.name !== undefined) key.rename(attributes.name);
    if (attributes.description !== undefined) key.describe(attributes.description);
    if (attributes.isDisabled !== undefined) {
      if (attributes.isDisabled) key.disable();
      else key.enable();
    }
    if (attributes.hasDeleteProtection !== undefined) {
      if (attributes.hasDeleteProtection) key.protect();
      else key.unprotect();
    }
    if (attributes.isExportable !== undefined) {
      if (attributes.isExportable) key.allowExport();
      else key.forbidExport();
    }
    if (attributes.isPublicKeyPublished !== undefined) {
      if (attributes.isPublicKeyPublished) key.publishPublicKey();
      else key.unpublishPublicKey();
    }
    if (attributes.kmipMetadata !== undefined) key.setKmipMetadata(attributes.kmipMetadata);
  }
}
