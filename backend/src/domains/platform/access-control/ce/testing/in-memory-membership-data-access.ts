import { TMemberships } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { TMembershipDataAccess, TNewMembership } from "../data-access/membership-data-access";
import { Membership } from "../model/membership";
import { InMemoryAccessControlState } from "./in-memory-access-control-state";

export class InMemoryMembershipDataAccess implements TMembershipDataAccess {
  constructor(private readonly state: InMemoryAccessControlState) {}

  private restore(row: TMemberships): Membership {
    const roles = [...this.state.tables.membershipRoles.values()]
      .filter((role) => role.membershipId === row.id)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((role) => {
        const customRole = role.customRoleId ? this.state.tables.roles.get(role.customRoleId) : undefined;
        return {
          ...role,
          customRoleSlug: customRole?.slug ?? null,
          customRoleName: customRole?.name ?? null,
          customRolePermissions: customRole?.permissions ?? null
        };
      });
    return Membership.restore({ ...row, roles });
  }

  async findById(id: string): Promise<Membership | undefined> {
    const row = this.state.tables.memberships.get(id);
    return row ? this.restore(row) : undefined;
  }

  async findByIds(ids: string[]): Promise<Membership[]> {
    return ids.flatMap((id) => {
      const row = this.state.tables.memberships.get(id);
      return row ? [this.restore(row)] : [];
    });
  }

  async create({ roles, ...membership }: TNewMembership): Promise<Membership> {
    const now = new Date();
    const row: TMemberships = {
      isActive: true,
      ...membership,
      id: InMemoryAccessControlState.newId(),
      createdAt: now,
      updatedAt: now
    } as TMemberships;
    Membership.restore({ ...row, roles: [] });
    // Postgres holds one membership per actor and scope (the membership_unique_* indexes).
    const sameKey = (other: TMemberships) =>
      other.scope === row.scope &&
      other.scopeOrgId === row.scopeOrgId &&
      (other.scopeProjectId ?? null) === (row.scopeProjectId ?? null) &&
      (other.scopeResourceType ?? null) === (row.scopeResourceType ?? null) &&
      (other.scopeResourceId ?? null) === (row.scopeResourceId ?? null) &&
      (other.actorUserId ?? null) === (row.actorUserId ?? null) &&
      (other.actorIdentityId ?? null) === (row.actorIdentityId ?? null) &&
      (other.actorGroupId ?? null) === (row.actorGroupId ?? null);
    if ([...this.state.tables.memberships.values()].some(sameKey)) {
      throw new DatabaseError({
        name: "Create membership",
        error: new Error("duplicate key value violates unique constraint: one membership per actor and scope")
      });
    }
    this.state.tables.memberships.set(row.id, row);
    for (const role of roles) {
      const roleId = InMemoryAccessControlState.newId();
      this.state.tables.membershipRoles.set(roleId, {
        isTemporary: false,
        ...role,
        id: roleId,
        membershipId: row.id,
        createdAt: now,
        updatedAt: now
      });
    }
    return this.restore(row);
  }

  async deleteByIds(ids: string[]): Promise<Membership[]> {
    return ids.flatMap((id) => {
      const row = this.state.tables.memberships.get(id);
      if (!row) return [];
      this.state.deleteMembership(id);
      return [Membership.restore({ ...row, roles: [] })];
    });
  }
}
