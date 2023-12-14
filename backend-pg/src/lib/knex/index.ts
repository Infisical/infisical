import { Knex } from "knex";
import { Tables } from "knex/types/tables";

import { TableName } from "@app/db/schemas";

import { DatabaseError } from "../errors";

export * from "./join";

export const withTransaction = <K extends object>(db: Knex, dal: K) => ({
  transaction: async <T>(cb: (tx: Knex) => Promise<T>) =>
    db.transaction(async (trx) => {
      const res = await cb(trx);
      return res;
    }),
  ...dal
});

// What is ormify
// It is to inject typical operations like find, findOne, update, delete, create
// This will avoid writing most common ones each time
export const ormify = <DbOps extends object, Tname extends TableName>(
  db: Knex,
  tableName: Tname,
  dal?: DbOps
) => ({
  transaction: async <T>(cb: (tx: Knex) => Promise<T>) =>
    db.transaction(async (trx) => {
      const res = await cb(trx);
      return res;
    }),
  findById: (id: string, tx?: Knex) => {
    try {
      return (tx || db)(tableName)
        .where({ id } as any)
        .first("*");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  },
  findOne: async (filter: Partial<Tables[Tname]["base"]>, tx?: Knex) => {
    try {
      const res = await (tx || db)(tableName).where(filter).first("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  },
  find: (filter: Partial<Tables[Tname]["base"]>, tx?: Knex) => {
    try {
      return (tx || db)(tableName).where(filter);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  },
  create: async (data: Tables[Tname]["insert"], tx?: Knex) => {
    try {
      const [res] = await (tx || db)(tableName).insert(data).returning("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create" });
    }
  },
  insertMany: async (data: readonly Tables[Tname]["insert"][], tx?: Knex) => {
    try {
      const res = await (tx || db)(tableName)
        .insert(data as any)
        .returning("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create" });
    }
  },
  updateById: async (id: string, data: Tables[Tname]["update"], tx?: Knex) => {
    try {
      const [res] = await (tx || db)(tableName)
        .where({ id } as any)
        .update(data as any)
        .returning("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update by id" });
    }
  },
  update: async (
    filter: Partial<Tables[Tname]["base"]>,
    data: Tables[Tname]["update"],
    tx?: Knex
  ) => {
    try {
      const res = await (tx || db)(tableName)
        .where(filter)
        .update(data as any)
        .returning("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update" });
    }
  },
  deleteById: async (id: string, tx?: Knex) => {
    try {
      const [res] = await (tx || db)(tableName)
        .where({ id } as any)
        .delete()
        .returning("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete by id" });
    }
  },
  delete: async (filter: Partial<Tables[Tname]["base"]>, tx?: Knex) => {
    try {
      const res = await (tx || db)(tableName).where(filter).delete().returning("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete" });
    }
  },
  ...(dal || {})
});
