import { TAdditionalPrivileges, TAdditionalPrivilegesInsert } from "@app/db/schemas";

import { TPrivilegeDataAccess } from "../data-access/privilege-data-access";
import { Privilege } from "../model/privilege";
import { InMemoryAccessControlState } from "./in-memory-access-control-state";

export class InMemoryPrivilegeDataAccess implements TPrivilegeDataAccess {
  constructor(private readonly state: InMemoryAccessControlState) {}

  async findById(id: string): Promise<Privilege | undefined> {
    const row = this.state.tables.privileges.get(id);
    return row ? Privilege.restore(row) : undefined;
  }

  async create(privilege: Omit<TAdditionalPrivilegesInsert, "id" | "createdAt" | "updatedAt">): Promise<Privilege> {
    const now = new Date();
    const row: TAdditionalPrivileges = {
      isTemporary: false,
      ...privilege,
      id: InMemoryAccessControlState.newId(),
      createdAt: now,
      updatedAt: now
    };
    const created = Privilege.restore(row);
    this.state.tables.privileges.set(row.id, row);
    return created;
  }

  async deleteByIds(ids: string[]): Promise<Privilege[]> {
    return ids.flatMap((id) => {
      const row = this.state.tables.privileges.get(id);
      if (!row) return [];
      this.state.tables.privileges.delete(id);
      return [Privilege.restore(row)];
    });
  }
}
