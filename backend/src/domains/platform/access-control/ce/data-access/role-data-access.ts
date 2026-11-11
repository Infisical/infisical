import { TableName, TRolesInsert } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";

import { Role } from "../model/role";
import { serializePermissions } from "./serialize-permissions";

export type TRoleDataAccess = {
  findById(id: string, options?: TReadOptions): Promise<Role | undefined>;
  // The org's or project's custom roles with these slugs; slugs with no role are left out.
  findBySlugs(
    input: { owner: { orgId: string } | { projectId: string }; slugs: string[] },
    options?: TReadOptions
  ): Promise<Role[]>;
  create(role: Omit<TRolesInsert, "id" | "createdAt" | "updatedAt">): Promise<Role>;
  deleteById(id: string): Promise<Role | undefined>;
};

// Owns roles (custom org and project roles).
export class RoleDataAccess implements TRoleDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  async findById(id: string, options?: TReadOptions): Promise<Role | undefined> {
    try {
      const row = await this.db.reader(options)(TableName.Role).where({ id }).first();
      return row ? Role.restore(row) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find role" });
    }
  }

  async findBySlugs(
    { owner, slugs }: { owner: { orgId: string } | { projectId: string }; slugs: string[] },
    options?: TReadOptions
  ): Promise<Role[]> {
    if (!slugs.length) return [];
    try {
      const rows = await this.db
        .reader(options)(TableName.Role)
        .where(owner)
        .whereIn("slug", slugs)
        .select("*")
        .orderBy("slug");
      return rows.map((row) => Role.restore(row));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find roles by slug" });
    }
  }

  async create(role: Omit<TRolesInsert, "id" | "createdAt" | "updatedAt">): Promise<Role> {
    try {
      const [row] = await this.db
        .writer()(TableName.Role)
        .insert({ ...role, permissions: serializePermissions(role.permissions) })
        .returning("*");
      return Role.restore(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Create role" });
    }
  }

  async deleteById(id: string): Promise<Role | undefined> {
    try {
      const [row] = await this.db.writer()(TableName.Role).where({ id }).del().returning("*");
      return row ? Role.restore(row) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete role" });
    }
  }
}
