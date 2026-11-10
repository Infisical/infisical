import { TRolesInsert } from "@app/db/schemas";

import { TRoleDataAccess } from "../data-access/role-data-access";
import { Role } from "../model/role";
import { InMemoryAccessControlState } from "./in-memory-access-control-state";

export class InMemoryRoleDataAccess implements TRoleDataAccess {
  constructor(private readonly state: InMemoryAccessControlState) {}

  async findById(id: string): Promise<Role | undefined> {
    const row = this.state.tables.roles.get(id);
    return row ? Role.restore(row) : undefined;
  }

  async create(role: Omit<TRolesInsert, "id" | "createdAt" | "updatedAt">): Promise<Role> {
    const now = new Date();
    const row = { ...role, id: InMemoryAccessControlState.newId(), createdAt: now, updatedAt: now };
    const created = Role.restore(row);
    this.state.tables.roles.set(row.id, row);
    return created;
  }

  async deleteById(id: string): Promise<Role | undefined> {
    const row = this.state.tables.roles.get(id);
    if (!row) return undefined;
    this.state.tables.roles.delete(id);
    return Role.restore(row);
  }
}
