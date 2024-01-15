import { Knex } from "knex";
import { Tables } from "knex/types/tables";

import { DatabaseError } from "../errors";

export * from "./join";
export * from "./select";

export const withTransaction = <K extends object>(db: Knex, dal: K) => ({
  transaction: async <T>(cb: (tx: Knex) => Promise<T>) =>
    db.transaction(async (trx) => {
      const res = await cb(trx);
      return res;
    }),
  ...dal
});

export type TFindFilter<R extends {} = any> = Partial<R> & {
  $in?: Partial<{ [k in keyof R]: R[k][] }>;
};
export const buildFindFilter =
  <R extends {} = any>({ $in, ...filter }: TFindFilter<R>) =>
  (bd: Knex.QueryBuilder<R, R>) => {
    bd.where(filter);
    if ($in) {
      Object.entries($in).forEach(([key, val]) => {
        bd.whereIn(key as any, val as any);
      });
    }
    return bd;
  };

export type TFindOpt<R extends {} = any> = {
  limit?: number;
  offset?: number;
  sort?: Array<[keyof R, "asc" | "desc"] | [keyof R, "asc" | "desc", "first" | "last"]>;
  tx?: Knex;
};

// What is ormify
// It is to inject typical operations like find, findOne, update, delete, create
// This will avoid writing most common ones each time
export const ormify = <DbOps extends object, Tname extends keyof Tables>(
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
  find: async (
    filter: TFindFilter<Tables[Tname]["base"]>,
    { offset, limit, sort, tx }: TFindOpt<Tables[Tname]["base"]> = {}
  ) => {
    try {
      const query = (tx || db)(tableName).where(buildFindFilter(filter));
      if (limit) query.limit(limit);
      if (offset) query.offset(offset);
      if (sort) {
        query.orderBy(
          sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls }))
        );
      }
      const res = await query;
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  },
  create: async (data: Tables[Tname]["insert"], tx?: Knex) => {
    try {
      const [res] = await (tx || db)(tableName)
        .insert(data as any)
        .returning("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create" });
    }
  },
  insertMany: async (data: readonly Tables[Tname]["insert"][], tx?: Knex) => {
    try {
      if (!data.length) return [];
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
    filter: TFindFilter<Tables[Tname]["base"]>,
    data: Tables[Tname]["update"],
    tx?: Knex
  ) => {
    try {
      const res = await (tx || db)(tableName)
        .where(buildFindFilter(filter))
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
  delete: async (filter: TFindFilter<Tables[Tname]["base"]>, tx?: Knex) => {
    try {
      const res = await (tx || db)(tableName)
        .where(buildFindFilter(filter))
        .delete()
        .returning("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete" });
    }
  },
  ...(dal || {})
});
