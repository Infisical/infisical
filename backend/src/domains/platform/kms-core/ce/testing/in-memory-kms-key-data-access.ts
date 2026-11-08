import { ProjectType } from "@app/db/schemas";

import { TKmsKeyDataAccess, TKmsKeyFilter, TKmsKeyPageQuery } from "../data-access/kms-key-data-access";
import { KmsKey } from "../model/kms-key";
import { InMemoryKmsCoreState } from "./in-memory-kms-core-state";

export class InMemoryKmsKeyDataAccess implements TKmsKeyDataAccess {
  constructor(private readonly state: InMemoryKmsCoreState) {}

  async create(key: KmsKey): Promise<KmsKey> {
    const props = key.toJSON();
    const duplicate = [...this.state.tables.kmsKeys.values()].some(
      (row) =>
        row.orgId === props.orgId && (row.projectId ?? null) === (props.projectId ?? null) && row.name === props.name
    );
    if (duplicate) throw new Error(`duplicate key value violates unique constraint (name '${props.name}')`);
    this.state.tables.kmsKeys.set(props.id, props);
    return KmsKey.restore(props);
  }

  async findById(id: string) {
    const props = this.state.tables.kmsKeys.get(id);
    return props ? KmsKey.restore(props) : undefined;
  }

  async find(filter: TKmsKeyFilter) {
    return [...this.state.tables.kmsKeys.values()]
      .filter(
        (row) =>
          (!filter.id || row.id === filter.id) &&
          (!filter.ids || filter.ids.includes(row.id)) &&
          (!filter.orgId || row.orgId === filter.orgId) &&
          (filter.projectId === undefined || (row.projectId ?? null) === filter.projectId) &&
          (!filter.name || row.name === filter.name) &&
          (filter.isReserved === undefined || Boolean(row.isReserved) === filter.isReserved) &&
          (!filter.keyUsage || row.keyUsage === filter.keyUsage)
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((row) => KmsKey.restore(row));
  }

  findByIdForRotation(id: string) {
    return this.findById(id);
  }

  async listProjectKeys({ projectId, offset, limit, orderDirection, search }: TKmsKeyPageQuery) {
    const needle = search?.toLowerCase();
    const matching = [...this.state.tables.kmsKeys.values()]
      .filter(
        (row) =>
          row.projectId === projectId &&
          !row.isReserved &&
          row.internal &&
          (!needle || row.name.toLowerCase().includes(needle) || row.id.includes(needle))
      )
      .sort((a, b) => (orderDirection === "desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
    const page = limit ? matching.slice(offset, offset + limit) : matching;
    return { keys: page.map((row) => KmsKey.restore(row)), totalCount: matching.length };
  }

  async saveMaterial(key: KmsKey) {
    this.replace(key, (row) => ({ ...row, internal: key.internal }));
  }

  async saveAttributes(key: KmsKey) {
    const { internal, external, ...attributes } = key.toJSON();
    this.replace(key, (row) => ({ ...row, ...attributes, internal: row.internal, external: row.external }));
  }

  async saveExternalConfig(key: KmsKey) {
    this.replace(key, (row) => ({ ...row, external: key.external }));
  }

  async deleteById(id: string) {
    const key = await this.findById(id);
    if (key) this.delete(id);
    return key;
  }

  async deleteIfUnprotected(id: string) {
    const key = await this.findById(id);
    if (!key) return undefined;
    if (key.hasDeleteProtection) return null;
    this.delete(id);
    return key;
  }

  async deleteByIds(ids: string[]) {
    const existing = ids.filter((id) => this.state.tables.kmsKeys.has(id));
    existing.forEach((id) => this.delete(id));
    return existing.length;
  }

  async countProjectKeysInOrg(orgId: string, projectType: ProjectType) {
    const projects = [...this.state.tables.projects.values()].filter(
      (project) => project.orgId === orgId && !project.deleteAfter && project.type === projectType
    );
    const projectIds = new Set(projects.map((project) => project.id));
    return [...this.state.tables.kmsKeys.values()].filter((row) => row.projectId && projectIds.has(row.projectId))
      .length;
  }

  private replace(key: KmsKey, update: (row: ReturnType<KmsKey["toJSON"]>) => ReturnType<KmsKey["toJSON"]>) {
    const row = this.state.tables.kmsKeys.get(key.id);
    if (row) this.state.tables.kmsKeys.set(key.id, update(row));
  }

  // Versions go with the key, as the foreign keys cascade in Postgres.
  private delete(id: string) {
    const internalId = this.state.tables.kmsKeys.get(id)?.internal?.id;
    this.state.tables.kmsKeys.delete(id);
    this.state.tables.kmsKeyVersions = this.state.tables.kmsKeyVersions.filter(
      (row) => row.internalKmsId !== internalId
    );
  }
}
