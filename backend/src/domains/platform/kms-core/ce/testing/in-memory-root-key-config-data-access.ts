import { TRootKeyConfigDataAccess, TRootKeyConfigPatch } from "../data-access/root-key-config-data-access";
import { RootKeyConfig } from "../model/root-key-config";
import { InMemoryKmsCoreState } from "./in-memory-kms-core-state";

export class InMemoryRootKeyConfigDataAccess implements TRootKeyConfigDataAccess {
  constructor(private readonly state: InMemoryKmsCoreState) {}

  async findById(id: string) {
    const row = this.state.tables.rootKeyConfigs.get(id);
    return row ? RootKeyConfig.restore(row) : undefined;
  }

  async findAll() {
    return this.rows().map((row) => RootKeyConfig.restore(row));
  }

  async findStaged() {
    return (await this.findAll()).filter((row) => row.isStaged);
  }

  async findRetained() {
    return (await this.findAll())
      .filter((row) => !row.isActive && row.supersededAt)
      .sort((a, b) => (b.supersededAt as Date).getTime() - (a.supersededAt as Date).getTime());
  }

  async create(config: RootKeyConfig) {
    const props = config.toJSON();
    if (this.state.tables.rootKeyConfigs.has(props.id))
      throw new Error("duplicate key value violates unique constraint");
    this.state.tables.rootKeyConfigs.set(props.id, props);
    return RootKeyConfig.restore(props);
  }

  async update(id: string, patch: TRootKeyConfigPatch) {
    const row = this.state.tables.rootKeyConfigs.get(id);
    if (row) this.state.tables.rootKeyConfigs.set(id, { ...row, ...patch, updatedAt: new Date() });
  }

  async deleteById(id: string) {
    return this.state.tables.rootKeyConfigs.delete(id);
  }

  async deleteAllStaged() {
    (await this.findStaged()).forEach((row) => this.state.tables.rootKeyConfigs.delete(row.id));
  }

  private rows() {
    return [...this.state.tables.rootKeyConfigs.values()];
  }
}
