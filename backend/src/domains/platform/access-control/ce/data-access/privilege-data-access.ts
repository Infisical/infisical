import { TableName, TAdditionalPrivilegesInsert } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";

import { Privilege } from "../model/privilege";
import { serializePermissions } from "./serialize-permissions";

export type TPrivilegeDataAccess = {
  findById(id: string, options?: TReadOptions): Promise<Privilege | undefined>;
  create(privilege: Omit<TAdditionalPrivilegesInsert, "id" | "createdAt" | "updatedAt">): Promise<Privilege>;
  deleteByIds(ids: string[]): Promise<Privilege[]>;
};

// Owns additional_privileges, folder grants included.
export class PrivilegeDataAccess implements TPrivilegeDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  async findById(id: string, options?: TReadOptions): Promise<Privilege | undefined> {
    try {
      const row = await this.db.reader(options)(TableName.AdditionalPrivilege).where({ id }).first();
      return row ? Privilege.restore(row) : undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find privilege" });
    }
  }

  async create(privilege: Omit<TAdditionalPrivilegesInsert, "id" | "createdAt" | "updatedAt">): Promise<Privilege> {
    try {
      const [row] = await this.db
        .writer()(TableName.AdditionalPrivilege)
        .insert({ ...privilege, permissions: serializePermissions(privilege.permissions) })
        .returning("*");
      return Privilege.restore(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Create privilege" });
    }
  }

  async deleteByIds(ids: string[]): Promise<Privilege[]> {
    if (!ids.length) return [];
    try {
      const rows = await this.db.writer()(TableName.AdditionalPrivilege).whereIn("id", ids).del().returning("*");
      return rows.map((row) => Privilege.restore(row));
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete privileges" });
    }
  }
}
