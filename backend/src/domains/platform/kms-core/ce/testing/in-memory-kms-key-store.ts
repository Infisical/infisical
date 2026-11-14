import { ProjectType } from "@app/db/schemas";
import { OrderByDirection } from "@app/lib/types";

import { KmsKey, TKmsKeyRecord } from "../models/kms-key";
import { TKmsKeyFilter, TKmsKeyPageQuery, TKmsKeyStore } from "../services/dependencies";
import { InMemoryKmsKeyVersionStore } from "./in-memory-kms-key-version-store";
import { InMemoryPlatformRows } from "./in-memory-platform-rows";

// Rows are replaced, never changed in place, so a shallow copy of the map is a full snapshot.
export class InMemoryKmsKeyStore implements TKmsKeyStore {
  private keys = new Map<string, TKmsKeyRecord>();

  constructor(
    private readonly platformRows: InMemoryPlatformRows,
    private readonly versionStore: InMemoryKmsKeyVersionStore
  ) {}

  async findById(id: string): Promise<KmsKey | null> {
    const record = this.keys.get(id);
    return record ? KmsKey.restore(record) : null;
  }

  async find(filter: TKmsKeyFilter): Promise<KmsKey[]> {
    return [...this.keys.values()]
      .filter(
        (row) =>
          (filter.id === undefined || row.id === filter.id) &&
          (filter.ids === undefined || filter.ids.includes(row.id)) &&
          (filter.orgId === undefined || row.orgId === filter.orgId) &&
          (filter.projectId === undefined || row.projectId === filter.projectId) &&
          (filter.name === undefined || row.name === filter.name) &&
          (filter.isReserved === undefined || row.isReserved === filter.isReserved) &&
          (filter.keyUsage === undefined || row.keyUsage === filter.keyUsage) &&
          (filter.isExternal === undefined || (row.external !== null) === filter.isExternal)
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((row) => KmsKey.restore(row));
  }

  findForUpdate(id: string): Promise<KmsKey | null> {
    return this.findById(id);
  }

  findForRotation(id: string): Promise<KmsKey | null> {
    return this.findById(id);
  }

  async findPublishedById(id: string): Promise<KmsKey | null> {
    const record = this.keys.get(id);
    if (!record?.isPublicKeyPublished || !record.projectId) return null;
    if (this.platformRows.autoCreate && !this.platformRows.projects.has(record.projectId)) {
      this.platformRows.addProject(record.projectId, record.orgId);
    }
    const project = this.platformRows.projects.get(record.projectId);
    return project && !project.deleteAfter ? KmsKey.restore(record) : null;
  }

  async listProjectKeys({
    projectId,
    offset,
    limit,
    orderDirection,
    search
  }: TKmsKeyPageQuery): Promise<{ keys: KmsKey[]; totalCount: number }> {
    const needle = search?.toLowerCase();
    const matching = [...this.keys.values()]
      .filter(
        (row) =>
          row.projectId === projectId &&
          !row.isReserved &&
          row.internal !== null &&
          (!needle || row.name.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle))
      )
      .sort((a, b) =>
        orderDirection === OrderByDirection.DESC ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)
      );
    const page = limit ? matching.slice(offset, offset + limit) : matching;
    return { keys: page.map((row) => KmsKey.restore(row)), totalCount: matching.length };
  }

  async countProjectKeysInOrg(orgId: string, projectType: ProjectType): Promise<number> {
    const projectIds = new Set(
      [...this.platformRows.projects.values()]
        .filter((project) => project.orgId === orgId && !project.deleteAfter && project.type === projectType)
        .map((project) => project.id)
    );
    return [...this.keys.values()].filter((row) => row.projectId && projectIds.has(row.projectId)).length;
  }

  async insert(key: KmsKey): Promise<void> {
    const record = key.toJSON();
    if (this.keys.has(record.id)) throw new Error("duplicate key value violates unique constraint on kms_keys");
    this.assertNameFree(record);
    this.keys.set(record.id, record);
  }

  // Writes only the columns the Postgres store writes: what a key cannot change after creation stays as stored.
  async save(key: KmsKey): Promise<void> {
    const stored = this.keys.get(key.id);
    if (!stored) return;
    const next = key.toJSON();
    this.assertNameFree({ ...stored, name: next.name });
    this.keys.set(key.id, {
      ...stored,
      name: next.name,
      description: next.description,
      isDisabled: next.isDisabled,
      hasDeleteProtection: next.hasDeleteProtection,
      isExportable: next.isExportable,
      isPublicKeyPublished: next.isPublicKeyPublished,
      kmipMetadata: next.kmipMetadata,
      updatedAt: next.updatedAt,
      internal:
        stored.internal && next.internal?.id === stored.internal.id
          ? { ...stored.internal, encryptedKey: next.internal.encryptedKey, version: next.internal.version }
          : stored.internal,
      external:
        stored.external && next.external?.id === stored.external.id
          ? { ...stored.external, encryptedProviderInputs: next.external.encryptedProviderInputs }
          : stored.external
    });
  }

  async delete(id: string): Promise<void> {
    this.remove(id);
  }

  async deleteMany(ids: string[]): Promise<number> {
    const existing = ids.filter((id) => this.keys.has(id));
    existing.forEach((id) => this.remove(id));
    return existing.length;
  }

  snapshot(): unknown {
    return new Map(this.keys);
  }

  restore(snapshot: unknown) {
    this.keys = snapshot as Map<string, TKmsKeyRecord>;
  }

  // The unique index on (orgId, projectId, name): org-level keys have a null project, which never collides.
  private assertNameFree(record: Pick<TKmsKeyRecord, "id" | "orgId" | "projectId" | "name">) {
    if (record.projectId === null) return;
    const taken = [...this.keys.values()].some(
      (row) =>
        row.id !== record.id &&
        row.orgId === record.orgId &&
        row.projectId === record.projectId &&
        row.name === record.name
    );
    if (taken) throw new Error("duplicate key value violates unique constraint kms_keys_orgid_projectid_slug_unique");
  }

  private remove(id: string) {
    const internalId = this.keys.get(id)?.internal?.id;
    this.keys.delete(id);
    if (internalId) this.versionStore.deleteByInternalKmsId(internalId);
  }
}
