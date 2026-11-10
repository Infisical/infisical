import { randomUUID } from "node:crypto";

import { SuperAdminSchema, TSuperAdminInsert } from "@app/db/schemas";

import {
  INSTANCE_CONFIG_ID,
  TInstanceConfigDataAccess,
  TInstanceConfigUpdate
} from "../data-access/instance-config-data-access";
import { InstanceConfig } from "../model/instance-config";
import { InMemoryInstanceConfigCoreState } from "./in-memory-instance-config-core-state";

// Postgres stamps updatedAt with a trigger. Each write here gets a strictly later time, so two writes in the same
// millisecond still differ.
const nextUpdatedAt = (previous?: Date) => {
  const now = Date.now();
  return new Date(previous && previous.getTime() >= now ? previous.getTime() + 1 : now);
};

export class InMemoryInstanceConfigDataAccess implements TInstanceConfigDataAccess {
  constructor(private readonly state: InMemoryInstanceConfigCoreState) {}

  async findById() {
    this.state.reads += 1;
    const { row } = this.state.tables;
    if (!row) return undefined;
    const org = row.defaultAuthOrgId ? this.state.tables.orgs.get(row.defaultAuthOrgId) : undefined;
    return InstanceConfig.restore({
      ...row,
      defaultAuthOrgSlug: org?.slug ?? null,
      defaultAuthOrgAuthEnforced: org ? org.authEnforced : null,
      defaultAuthOrgAuthMethod: org?.authMethod ?? null
    });
  }

  // SuperAdminSchema applies the column defaults Postgres would.
  async createIfMissing(settings: TSuperAdminInsert) {
    if (!this.state.tables.row) {
      const now = new Date();
      this.state.tables.row = SuperAdminSchema.parse({
        instanceId: randomUUID(),
        ...settings,
        id: INSTANCE_CONFIG_ID,
        createdAt: now,
        updatedAt: now
      });
    }
    const config = await this.findById();
    if (!config) throw new Error("Instance config row missing after create");
    return config;
  }

  async update(columns: TInstanceConfigUpdate) {
    const { row } = this.state.tables;
    if (!row) return;
    this.state.tables.row = SuperAdminSchema.parse({ ...row, ...columns, updatedAt: nextUpdatedAt(row.updatedAt) });
  }
}
