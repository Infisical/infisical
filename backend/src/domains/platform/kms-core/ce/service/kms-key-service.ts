import slugify from "@sindresorhus/slugify";

import { ProjectType } from "@app/db/schemas";
import { TTransactionRunner } from "@app/domains/lib/transaction-runner";
import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { OrderByDirection } from "@app/lib/types";

import { TKmsCoreStore } from "../data-access/kms-core-store";
import { TKmsKeyFilter } from "../data-access/kms-key-data-access";
import { KmsKey, KmsKeyUsage, TKmsKeyAttributes, TKmsKeyRecord } from "../model/kms-key";
import {
  generateKeyMaterial,
  notFoundKey,
  requireKey,
  TKmsCoreState,
  unwrapWithRootKey,
  validateImportedMaterial,
  wrapWithRootKey
} from "./key-material";
import { KmsKeyOrderBy, TGenerateKMSDTO, TImportKeyMaterialDTO, TListKmsKeysDTO } from "./kms-core-types";

// A key's public shape: its kms_keys columns plus the algorithm and version of its internal material.
export type TKmsKeyDetails = TKmsKeyRecord & {
  isExternal: boolean;
  encryptionAlgorithm?: string;
  version?: number;
};

export const toKeyDetails = (key: KmsKey): TKmsKeyDetails => ({
  ...key.toRecord(),
  isExternal: key.isExternal,
  encryptionAlgorithm: key.encryptionAlgorithm,
  version: key.version
});

export type TKmsKeyServiceDeps = {
  runner: TTransactionRunner<TKmsCoreStore>;
  replica: TKmsCoreStore;
  primary: TKmsCoreStore;
  state: TKmsCoreState;
};

const keyName = (name?: string) => (name ? slugify(name) : slugify(alphaNumericNanoId(8).toLowerCase()));

export class KmsKeyService {
  constructor(private readonly deps: TKmsKeyServiceDeps) {}

  async generateKmsKey({
    orgId,
    projectId,
    name,
    description,
    isReserved = true,
    isExportable = true,
    hasDeleteProtection = false,
    encryptionAlgorithm = SymmetricKeyAlgorithm.AES_GCM_256,
    keyUsage = KmsKeyUsage.ENCRYPT_DECRYPT
  }: TGenerateKMSDTO): Promise<TKmsKeyRecord> {
    const material = await generateKeyMaterial(keyUsage, encryptionAlgorithm);
    const key = KmsKey.createInternal({
      orgId,
      projectId,
      name: keyName(name),
      description,
      keyUsage,
      encryptionAlgorithm,
      encryptedKey: wrapWithRootKey(this.deps.state, material),
      isReserved,
      isExportable,
      hasDeleteProtection
    });
    const created = await this.deps.runner.run(({ store }) => store.kmsKeys.create(key));
    return created.toRecord();
  }

  async importKeyMaterial({
    key: material,
    algorithm,
    name,
    isReserved,
    isExportable = true,
    hasDeleteProtection = false,
    projectId,
    orgId,
    keyUsage,
    kmipMetadata
  }: TImportKeyMaterialDTO): Promise<TKmsKeyRecord> {
    await validateImportedMaterial(material, keyUsage, algorithm);
    const key = KmsKey.createInternal({
      orgId,
      projectId,
      name: keyName(name),
      keyUsage,
      encryptionAlgorithm: algorithm,
      encryptedKey: wrapWithRootKey(this.deps.state, material),
      isReserved,
      isExportable,
      hasDeleteProtection,
      kmipMetadata
    });
    const created = await this.deps.runner.run(({ store }) => store.kmsKeys.create(key));
    return created.toRecord();
  }

  // Archives the current material and installs new material. Old ciphertext stays readable.
  rotateKmsKey(kmsId: string): Promise<{ id: string; version: number }> {
    return this.deps.runner.run(async ({ store }) => {
      const key = await store.kmsKeys.findByIdForRotation(kmsId);
      if (!key) throw notFoundKey(kmsId);
      key.assertRotatable();

      const algorithm = key.encryptionAlgorithm as SymmetricKeyAlgorithm;
      const material = crypto.randomBytes(KmsKey.symmetricKeyLength(algorithm));
      const archived = key.rotate(wrapWithRootKey(this.deps.state, material));
      await store.kmsKeyVersions.create(archived);
      await store.kmsKeys.saveMaterial(key);
      return { id: key.id, version: key.version as number };
    });
  }

  async getKmsById(kmsId: string) {
    const key = await requireKey(this.deps.replica, kmsId);
    return { id: key.id, name: key.name, orgId: key.orgId, isExternal: key.isExternal };
  }

  async findKeyById(kmsId: string): Promise<TKmsKeyDetails | undefined> {
    const key = await this.deps.replica.kmsKeys.findById(kmsId);
    return key ? toKeyDetails(key) : undefined;
  }

  async findKeys(
    filter: TKmsKeyFilter,
    options: { consistency?: "replica" | "primary" } = {}
  ): Promise<TKmsKeyDetails[]> {
    const store = options.consistency === "primary" ? this.deps.primary : this.deps.replica;
    return (await store.kmsKeys.find(filter)).map(toKeyDetails);
  }

  async listProjectKeys({
    projectId,
    offset = 0,
    limit,
    orderBy = KmsKeyOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    search
  }: TListKmsKeysDTO): Promise<{ keys: TKmsKeyDetails[]; totalCount: number }> {
    const { keys, totalCount } = await this.deps.replica.kmsKeys.listProjectKeys({
      projectId,
      offset,
      limit,
      orderBy,
      orderDirection,
      search
    });
    return { keys: keys.map(toKeyDetails), totalCount };
  }

  updateKeyAttributes(kmsId: string, attributes: TKmsKeyAttributes): Promise<TKmsKeyDetails> {
    return this.deps.runner.run(async ({ store }) => {
      const key = await store.kmsKeys.findById(kmsId);
      if (!key) throw notFoundKey(kmsId);
      key.updateAttributes(attributes);
      await store.kmsKeys.saveAttributes(key);
      return toKeyDetails((await store.kmsKeys.findById(kmsId)) as KmsKey);
    });
  }

  // Null when the key has delete protection.
  deleteKey(kmsId: string): Promise<TKmsKeyDetails | null> {
    return this.deps.runner.run(async ({ store }) => {
      const deleted = await store.kmsKeys.deleteIfUnprotected(kmsId);
      if (deleted === undefined) throw notFoundKey(kmsId);
      return deleted ? toKeyDetails(deleted) : null;
    });
  }

  async deleteKeys(kmsIds: string[]): Promise<number> {
    if (!kmsIds.length) return 0;
    return this.deps.runner.run(({ store }) => store.kmsKeys.deleteByIds(kmsIds));
  }

  countProjectKeysInOrg(orgId: string, projectType: ProjectType) {
    return this.deps.replica.kmsKeys.countProjectKeysInOrg(orgId, projectType);
  }

  async getKeyMaterial({ kmsId }: { kmsId: string }): Promise<Buffer<ArrayBuffer>> {
    const key = await requireKey(this.deps.replica, kmsId);
    key.assertExportable();
    return unwrapWithRootKey(this.deps.state, key.internal?.encryptedKey as Buffer);
  }

  async getBulkKeyMaterial({ kmsIds }: { kmsIds: string[] }) {
    const keys = await this.deps.replica.kmsKeys.find({ ids: kmsIds });
    return keys.map((key) => {
      key.assertExportable(` [kmsId=${key.id}]`);
      return {
        kmsId: key.id,
        name: key.name,
        keyMaterial: unwrapWithRootKey(this.deps.state, key.internal?.encryptedKey as Buffer)
      };
    });
  }

  async assertKeyInOrg(kmsId: string, orgId: string) {
    const key = await this.deps.replica.kmsKeys.findById(kmsId);
    if (!key) throw new NotFoundError({ message: `KMS with ID '${kmsId}' not found` });
    if (key.orgId !== orgId)
      throw new ForbiddenRequestError({ message: "KMS ID does not belong in the organization." });
    return key;
  }
}
