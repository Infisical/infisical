import { randomUUID } from "node:crypto";

import { TSuperAdmin, TSuperAdminUpdate } from "@app/db/schemas";

import { TInstanceConfigDataAccess } from "../data-access/instance-config-data-access";
import { InstanceConfig } from "../model/instance-config";
import { InstanceConfigChange } from "../model/instance-config-change";
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

  async createIfMissing(initial: TSuperAdminUpdate & { id: string }) {
    if (!this.state.tables.row) {
      const now = new Date();
      this.state.tables.row = {
        instanceId: randomUUID(),
        fipsEnabled: false,
        onboardingCompleted: false,
        ...initial,
        createdAt: now,
        updatedAt: now
      } as TSuperAdmin;
    }
    return (await this.findById()) as InstanceConfig;
  }

  async update(change: InstanceConfigChange) {
    const { row } = this.state.tables;
    if (!row) return;
    this.state.tables.row = { ...row, ...change.toJSON(), updatedAt: nextUpdatedAt(row.updatedAt) } as TSuperAdmin;
  }
}
