import { TGroupsInsert } from "@app/db/schemas";

import { TGroupDataAccess, TGroupMemberRef } from "../data-access/group-data-access";
import { Group } from "../model/group";
import { InMemoryAccessControlState } from "./in-memory-access-control-state";

export class InMemoryGroupDataAccess implements TGroupDataAccess {
  constructor(private readonly state: InMemoryAccessControlState) {}

  async findById(id: string): Promise<Group | undefined> {
    const row = this.state.tables.groups.get(id);
    return row ? Group.restore(row) : undefined;
  }

  async create(group: Omit<TGroupsInsert, "id" | "createdAt" | "updatedAt">): Promise<Group> {
    const now = new Date();
    const row = { ...group, id: InMemoryAccessControlState.newId(), createdAt: now, updatedAt: now };
    this.state.tables.groups.set(row.id, row);
    return Group.restore(row);
  }

  // Cascades the way the foreign keys do: the group's members and its memberships go with it.
  async deleteById(id: string): Promise<Group | undefined> {
    const row = this.state.tables.groups.get(id);
    if (!row) return undefined;
    const { tables } = this.state;
    tables.groups.delete(id);
    tables.userGroups = tables.userGroups.filter((member) => member.groupId !== id);
    tables.identityGroups = tables.identityGroups.filter((member) => member.groupId !== id);
    for (const membership of [...tables.memberships.values()]) {
      if (membership.actorGroupId === id) this.state.deleteMembership(membership.id);
    }
    return Group.restore(row);
  }

  async addMembers(groupId: string, members: TGroupMemberRef[], { isPending = false } = {}): Promise<void> {
    const { tables } = this.state;
    for (const member of members) {
      if ("userId" in member) {
        if (!tables.userGroups.some((row) => row.groupId === groupId && row.userId === member.userId)) {
          tables.userGroups.push({ userId: member.userId, groupId, isPending });
        }
      } else if (
        !tables.identityGroups.some((row) => row.groupId === groupId && row.identityId === member.identityId)
      ) {
        tables.identityGroups.push({ identityId: member.identityId, groupId });
      }
    }
  }

  async removeMembers(groupId: string, members: TGroupMemberRef[]): Promise<void> {
    const { tables } = this.state;
    const userIds = new Set(members.flatMap((member) => ("userId" in member ? [member.userId] : [])));
    const identityIds = new Set(members.flatMap((member) => ("identityId" in member ? [member.identityId] : [])));
    tables.userGroups = tables.userGroups.filter((row) => row.groupId !== groupId || !userIds.has(row.userId));
    tables.identityGroups = tables.identityGroups.filter(
      (row) => row.groupId !== groupId || !identityIds.has(row.identityId)
    );
  }
}
