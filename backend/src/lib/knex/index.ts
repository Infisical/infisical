/* eslint-disable @typescript-eslint/no-misused-promises */
import { Knex } from "knex";
import { Tables } from "knex/types/tables";

import { TableName } from "@app/db/schemas";

import { DatabaseError } from "../errors";
import { buildDynamicKnexQuery, TKnexDynamicOperator } from "./dynamic";

export * from "./connection";
export * from "./join";
export * from "./prependTableNameToFindFilter";
export * from "./select";

export const withTransaction = <K extends object>(db: Knex, dal: K) => ({
  transaction: async <T>(cb: (tx: Knex) => Promise<T>) =>
    db.transaction(async (trx) => {
      const res = await cb(trx);
      return res;
    }),
  ...dal
});

export type TFindFilter<R extends object = object> = Partial<R> & {
  $in?: Partial<{ [k in keyof R]: R[k][] }>;
  $notNull?: Array<keyof R>;
  $search?: Partial<{ [k in keyof R]: R[k] }>;
  $complex?: TKnexDynamicOperator<R>;
};

export const buildFindFilter =
  <R extends object = object>(
    { $in, $notNull, $search, $complex, ...filter }: TFindFilter<R>,
    tableName?: TableName,
    excludeKeys?: string[]
  ) =>
  (bd: Knex.QueryBuilder<R, R>) => {
    const processedFilter = tableName
      ? Object.fromEntries(
          Object.entries(filter)
            .filter(([key]) => !excludeKeys || !excludeKeys.includes(key))
            .map(([key, value]) => [`${tableName}.${key}`, value])
        )
      : filter;

    void bd.where(processedFilter);
    if ($in) {
      Object.entries($in).forEach(([key, val]) => {
        if (val) {
          void bd.whereIn(`${tableName ? `${tableName}.` : ""}${key}`, val as never);
        }
      });
    }

    if ($notNull?.length) {
      $notNull.forEach((key) => {
        void bd.whereNotNull(`${tableName ? `${tableName}.` : ""}${key as string}`);
      });
    }

    if ($search) {
      Object.entries($search).forEach(([key, val]) => {
        if (val) {
          void bd.whereILike(`${tableName ? `${tableName}.` : ""}${key}`, val as never);
        }
      });
    }
    if ($complex) {
      return buildDynamicKnexQuery(bd, $complex);
    }
    return bd;
  };

export type TFindReturn<TQuery extends Knex.QueryBuilder, TCount extends boolean = false> = Array<
  Awaited<TQuery>[0] &
    (TCount extends true
      ? {
          count: string;
        }
      : unknown)
>;

export type TFindOpt<
  R extends object = object,
  TCount extends boolean = boolean,
  TCountDistinct extends keyof R | undefined = undefined
> = {
  limit?: number;
  offset?: number;
  sort?: Array<[keyof R, "asc" | "desc"] | [keyof R, "asc" | "desc", "first" | "last"]>;
  groupBy?: keyof R;
  count?: TCount;
  countDistinct?: TCountDistinct;
  tx?: Knex;
};

// What is ormify
// It is to inject typical operations like find, findOne, update, delete, create
// This will avoid writing most common ones each time
export const ormify = <DbOps extends object, Tname extends keyof Tables>(db: Knex, tableName: Tname, dal?: DbOps) => ({
  transaction: async <T>(cb: (tx: Knex) => Promise<T>) =>
    db.transaction(async (trx) => {
      const res = await cb(trx);
      return res;
    }),
  findById: async (id: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(tableName)
        .where({ id } as never)
        .first("*");
      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  },
  findOne: async (filter: Partial<Tables[Tname]["base"]>, tx?: Knex) => {
    try {
      const res = await (tx || db.replicaNode())(tableName).where(filter).first("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  },
  find: async <
    TCount extends boolean = false,
    TCountDistinct extends keyof Tables[Tname]["base"] | undefined = undefined
  >(
    filter: TFindFilter<Tables[Tname]["base"]>,
    { offset, limit, sort, count, tx, countDistinct }: TFindOpt<Tables[Tname]["base"], TCount, TCountDistinct> = {}
  ) => {
    try {
      const query = (tx || db.replicaNode())(tableName).where(buildFindFilter(filter));
      if (countDistinct) {
        void query.countDistinct(countDistinct);
      } else if (count) {
        void query.select(db.raw("COUNT(*) OVER() AS count"));
        void query.select("*");
      }
      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }

      const res = (await query) as TFindReturn<typeof query, TCountDistinct extends undefined ? TCount : true>;
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  },
  create: async (data: Tables[Tname]["insert"], tx?: Knex) => {
    try {
      const [res] = await (tx || db)(tableName)
        .insert(data as never)
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
        .insert(data as never)
        .returning("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create" });
    }
  },
  // This spilit the insert into multiple chunk
  batchInsert: async (data: readonly Tables[Tname]["insert"][], tx?: Knex) => {
    try {
      if (!data.length) return [];
      const res = await (tx || db).batchInsert(tableName, data as never).returning("*");
      return res as Tables[Tname]["base"][];
    } catch (error) {
      throw new DatabaseError({ error, name: "batchInsert" });
    }
  },
  upsert: async (data: readonly Tables[Tname]["insert"][], onConflictField: keyof Tables[Tname]["base"], tx?: Knex) => {
    try {
      if (!data.length) return [];
      const res = await (tx || db)(tableName)
        .insert(data as never)
        .onConflict(onConflictField as never)
        .merge()
        .returning("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create" });
    }
  },
  updateById: async (
    id: string,
    {
      $incr,
      $decr,
      ...data
    }: Tables[Tname]["update"] & {
      $incr?: { [x in keyof Partial<Tables[Tname]["base"]>]: number };
      $decr?: { [x in keyof Partial<Tables[Tname]["base"]>]: number };
    },
    tx?: Knex
  ) => {
    try {
      const query = (tx || db)(tableName)
        .where({ id } as never)
        .update(data as never)
        .returning("*");
      if ($incr) {
        Object.entries($incr).forEach(([incrementField, incrementValue]) => {
          void query.increment(incrementField, incrementValue);
        });
      }
      if ($decr) {
        Object.entries($decr).forEach(([incrementField, incrementValue]) => {
          void query.decrement(incrementField, incrementValue);
        });
      }
      const [docs] = await query;
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update by id" });
    }
  },
  update: async (
    filter: TFindFilter<Tables[Tname]["base"]>,
    {
      $incr,
      $decr,
      ...data
    }: Tables[Tname]["update"] & {
      $incr?: { [x in keyof Partial<Tables[Tname]["base"]>]: number };
      $decr?: { [x in keyof Partial<Tables[Tname]["base"]>]: number };
    },
    tx?: Knex
  ) => {
    try {
      const query = (tx || db)(tableName)
        .where(buildFindFilter(filter))
        .update(data as never)
        .returning("*");
      // increment and decrement operation in update
      if ($incr) {
        Object.entries($incr).forEach(([incrementField, incrementValue]) => {
          void query.increment(incrementField, incrementValue);
        });
      }
      if ($decr) {
        Object.entries($decr).forEach(([incrementField, incrementValue]) => {
          void query.increment(incrementField, incrementValue);
        });
      }
      return await query;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update" });
    }
  },
  deleteById: async (id: string, tx?: Knex) => {
    try {
      const [res] = await (tx || db)(tableName)
        .where({ id } as never)
        .delete()
        .returning("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete by id" });
    }
  },
  delete: async (filter: TFindFilter<Tables[Tname]["base"]>, tx?: Knex) => {
    try {
      const res = await (tx || db)(tableName).where(buildFindFilter(filter)).delete().returning("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete" });
    }
  },
  ...(dal || {})
});
