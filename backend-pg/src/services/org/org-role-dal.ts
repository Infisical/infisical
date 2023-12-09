import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName,TOrgRolesInsert, TOrgRolesUpdate } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { withTransaction } from "@app/lib/knex";

export type TOrgRoleDalFactory = ReturnType<typeof orgRoleDalFactory>;

export const orgRoleDalFactory = (db: TDbClient) => {
  const find = async (data: TOrgRolesUpdate, tx?: Knex) => {
    try {
      const role = await (tx || db)(TableName.OrgRoles).where(data);
      return role;
    } catch (error) {
      throw new DatabaseError({ error, name: "Org role find one" });
    }
  };

  const findOne = async (data: TOrgRolesUpdate, tx?: Knex) => {
    try {
      const role = await (tx || db)(TableName.OrgRoles).where(data).first();
      return role;
    } catch (error) {
      throw new DatabaseError({ error, name: "Org role find one" });
    }
  };

  const create = async (data: TOrgRolesInsert, tx?: Knex) => {
    try {
      const [role] = await (tx || db)(TableName.OrgRoles).insert(data).returning("*");
      return role;
    } catch (error) {
      throw new DatabaseError({ error, name: "Org role create" });
    }
  };

  const updateOne = async (
    filter: { id: string; orgId: string },
    data: TOrgRolesUpdate,
    tx?: Knex
  ) => {
    try {
      const [role] = await (tx || db)(TableName.OrgRoles).where(filter).update(data).returning("*");
      return role;
    } catch (error) {
      throw new DatabaseError({ error, name: "Org role create" });
    }
  };

  const deleteOne = async (filter: { id: string; orgId: string }, tx?: Knex) => {
    try {
      const [role] = await (tx || db)(TableName.OrgRoles).where(filter).delete().returning("*");
      return role;
    } catch (error) {
      throw new DatabaseError({ error, name: "Org role create" });
    }
  };

  return withTransaction(db, {
    find,
    findOne,
    create,
    updateOne,
    deleteOne
  });
};
