import { TableName, TAdditionalPrivilegesInsert } from "@app/db/schemas";
import { DataAccessDb, TReadOptions } from "@app/domains/lib/data-access-db";
import { ActorType } from "@app/lib/auth/actor-types";
import { DatabaseError } from "@app/lib/errors";

import { Privilege } from "../model/privilege";
import { serializePermissions } from "./serialize-permissions";

export type TPrivilegeDataAccess = {
  findById(id: string, options?: TReadOptions): Promise<Privilege | undefined>;
  create(privilege: Omit<TAdditionalPrivilegesInsert, "id" | "createdAt" | "updatedAt">): Promise<Privilege>;
  deleteByIds(ids: string[]): Promise<Privilege[]>;
  // The actor's own folder grants in a project (privileges on one secret folder), active or not.
  findFolderGrants(
    input: { actor: { type: ActorType.USER | ActorType.IDENTITY; id: string }; projectId: string },
    options?: TReadOptions
  ): Promise<Privilege[]>;
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

  async findFolderGrants(
    { actor, projectId }: { actor: { type: ActorType.USER | ActorType.IDENTITY; id: string }; projectId: string },
    options?: TReadOptions
  ): Promise<Privilege[]> {
    try {
      const rows = await this.db
        .reader(options)(TableName.AdditionalPrivilege)
        .where({ projectId })
        .where(actor.type === ActorType.USER ? { actorUserId: actor.id } : { actorIdentityId: actor.id })
        .whereNotNull("folderId")
        .select("*")
        .orderBy("id");
      return rows.map((row) => Privilege.restore(row));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find folder grants" });
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
