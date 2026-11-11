import { TableName, TGroupsInsert } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";

import { Group } from "../model/group";

export type TGroupMemberRef = { userId: string } | { identityId: string };

export type TGroupDataAccess = {
  findById(id: string, options?: TReadOptions): Promise<Group | undefined>;
  findByIds(ids: string[], options?: TReadOptions): Promise<Group[]>;
  create(group: Omit<TGroupsInsert, "id" | "createdAt" | "updatedAt">): Promise<Group>;
  deleteById(id: string): Promise<Group | undefined>;
  addMembers(groupId: string, members: TGroupMemberRef[], options?: { isPending?: boolean }): Promise<void>;
  removeMembers(groupId: string, members: TGroupMemberRef[]): Promise<void>;
};

// Owns groups, user_group_membership and identity_group_membership: a group is read and written with its members.
export class GroupDataAccess implements TGroupDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  async findById(id: string, options?: TReadOptions): Promise<Group | undefined> {
    try {
      const row = await this.db.reader(options)(TableName.Groups).where({ id }).first();
      return row ? Group.restore(row) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find group" });
    }
  }

  async findByIds(ids: string[], options?: TReadOptions): Promise<Group[]> {
    if (!ids.length) return [];
    try {
      const rows = await this.db.reader(options)(TableName.Groups).whereIn("id", ids).select("*").orderBy("id");
      return rows.map((row) => Group.restore(row));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find groups" });
    }
  }

  async create(group: Omit<TGroupsInsert, "id" | "createdAt" | "updatedAt">): Promise<Group> {
    try {
      const [row] = await this.db.writer()(TableName.Groups).insert(group).returning("*");
      return Group.restore(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Create group" });
    }
  }

  async deleteById(id: string): Promise<Group | undefined> {
    try {
      const [row] = await this.db.writer()(TableName.Groups).where({ id }).del().returning("*");
      return row ? Group.restore(row) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete group" });
    }
  }

  async addMembers(groupId: string, members: TGroupMemberRef[], { isPending = false } = {}): Promise<void> {
    try {
      const knex = this.db.writer();
      const userIds = members.flatMap((member) => ("userId" in member ? [member.userId] : []));
      const identityIds = members.flatMap((member) => ("identityId" in member ? [member.identityId] : []));
      if (userIds.length) {
        // user_group_membership has no unique index on (userId, groupId), so skip the ones already there.
        const existing = new Set(
          (
            await knex(TableName.UserGroupMembership).where({ groupId }).whereIn("userId", userIds).select("userId")
          ).map((row) => row.userId)
        );
        const missing = [...new Set(userIds)].filter((userId) => !existing.has(userId));
        if (missing.length) {
          await knex(TableName.UserGroupMembership).insert(missing.map((userId) => ({ userId, groupId, isPending })));
        }
      }
      if (identityIds.length) {
        await knex(TableName.IdentityGroupMembership)
          .insert(identityIds.map((identityId) => ({ identityId, groupId })))
          .onConflict(["identityId", "groupId"])
          .ignore();
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Add group members" });
    }
  }

  async removeMembers(groupId: string, members: TGroupMemberRef[]): Promise<void> {
    try {
      const knex = this.db.writer();
      const userIds = members.flatMap((member) => ("userId" in member ? [member.userId] : []));
      const identityIds = members.flatMap((member) => ("identityId" in member ? [member.identityId] : []));
      if (userIds.length) await knex(TableName.UserGroupMembership).where({ groupId }).whereIn("userId", userIds).del();
      if (identityIds.length) {
        await knex(TableName.IdentityGroupMembership).where({ groupId }).whereIn("identityId", identityIds).del();
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Remove group members" });
    }
  }
}
