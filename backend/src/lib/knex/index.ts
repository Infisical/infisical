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
  $notEqual?: Partial<{ [k in keyof R]: R[k] }>;
  $notNull?: Array<keyof R>;
  $search?: Partial<{ [k in keyof R]: R[k] }>;
  $complex?: TKnexDynamicOperator<R>;
};

export const buildFindFilter =
  <R extends object = object>(
    { $in, $notNull, $search, $complex, $notEqual, ...filter }: TFindFilter<R>,
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

    if ($notEqual) {
      Object.entries($notEqual).forEach(([key, val]) => {
        if (val) {
          void bd.whereNot(`${tableName ? `${tableName}.` : ""}${key}`, val as never);
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

export type TFindReturn<Tname extends keyof Tables, TCount extends boolean = false> = Array<
  Tables[Tname]["base"] &
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

export type TOrmify<Tname extends keyof Tables> = {
  transaction: <T>(cb: (tx: Knex) => Promise<T>) => Promise<T>;
  findById: (id: string, tx?: Knex) => Promise<Tables[Tname]["base"]>;
  find: <TCount extends boolean = false, TCountDistinct extends keyof Tables[Tname]["base"] | undefined = undefined>(
    filter: TFindFilter<Tables[Tname]["base"]>,
    { offset, limit, sort, count, tx, countDistinct }?: TFindOpt<Tables[Tname]["base"], TCount, TCountDistinct>
  ) => Promise<TFindReturn<Tname, TCountDistinct extends undefined ? TCount : true>>;
  findOne: (filter: Partial<Tables[Tname]["base"]>, tx?: Knex) => Promise<Tables[Tname]["base"]>;
  create: (data: Tables[Tname]["insert"], tx?: Knex) => Promise<Tables[Tname]["base"]>;
  insertMany: (data: readonly Tables[Tname]["insert"][], tx?: Knex) => Promise<Tables[Tname]["base"][]>;
  batchInsert: (data: readonly Tables[Tname]["insert"][], tx?: Knex) => Promise<Tables[Tname]["base"][]>;
  upsert: (
    data: readonly Tables[Tname]["insert"][],
    onConflictField: keyof Tables[Tname]["base"] | Array<keyof Tables[Tname]["base"]>,
    tx?: Knex,
    mergeColumns?: (keyof Knex.ResolveTableType<Knex.TableType<Tname>, "update">)[] | undefined
  ) => Promise<Tables[Tname]["base"][]>;
  updateById: (
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
  ) => Promise<Tables[Tname]["base"]>;
  update: (
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
  ) => Promise<Tables[Tname]["base"][]>;
  deleteById: (id: string, tx?: Knex) => Promise<Tables[Tname]["base"]>;
  countDocuments: (tx?: Knex) => Promise<number>;
  delete: (filter: TFindFilter<Tables[Tname]["base"]>, tx?: Knex) => Promise<Tables[Tname]["base"][]>;
};

// What is ormify
// It is to inject typical operations like find, findOne, update, delete, create
// This will avoid writing most common ones each time
export const ormify = <DbOps extends object, Tname extends keyof Tables>(
  db: Knex,
  tableName: Tname,
  dal?: DbOps
): TOrmify<Tname> => ({
  transaction: async <T>(cb: (tx: Knex) => Promise<T>) =>
    db.transaction(async (trx) => {
      const res = await cb(trx);
      return res;
    }),
  findById: async (id, tx): Promise<Tables[Tname]["base"]> => {
    try {
      const result = await (tx || db.replicaNode())(tableName)
        .where({ id } as never)
        .first("*");
      return result as Tables[Tname]["base"];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  },
  find: async <
    TCount extends boolean = false,
    TCountDistinct extends keyof Tables[Tname]["base"] | undefined = undefined
  >(
    filter: TFindFilter<Tables[Tname]["base"]>,
    { offset, limit, sort, count, tx, countDistinct }: TFindOpt<Tables[Tname]["base"], TCount, TCountDistinct> = {}
  ): Promise<TFindReturn<Tname, TCountDistinct extends undefined ? TCount : true>> => {
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

      const res = await query;
      return res as TFindReturn<Tname, TCountDistinct extends undefined ? TCount : true>;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  },
  findOne: async (filter, tx): Promise<Tables[Tname]["base"]> => {
    try {
      const res = await (tx || db.replicaNode())(tableName).where(filter).first("*");
      return res as Tables[Tname]["base"];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  },
  create: async (data, tx): Promise<Tables[Tname]["base"]> => {
    try {
      const [res] = await (tx || db)(tableName)
        .insert(data as never)
        .returning("*");
      return res as Tables[Tname]["base"];
    } catch (error) {
      throw new DatabaseError({ error, name: "Create" });
    }
  },
  insertMany: async (data, tx?): Promise<Tables[Tname]["base"][]> => {
    try {
      if (!data.length) return [];
      const res = await (tx || db)(tableName)
        .insert(data as never)
        .returning("*");
      return res as Tables[Tname]["base"][];
    } catch (error) {
      throw new DatabaseError({ error, name: "Create" });
    }
  },
  // This spilit the insert into multiple chunk
  batchInsert: async (data, tx): Promise<Tables[Tname]["base"][]> => {
    try {
      if (!data.length) return [];
      const res = await (tx || db).batchInsert(tableName, data as never).returning("*");
      return res as Tables[Tname]["base"][];
    } catch (error) {
      throw new DatabaseError({ error, name: "batchInsert" });
    }
  },
  upsert: async (data, onConflictField, tx, mergeColumns): Promise<Tables[Tname]["base"][]> => {
    try {
      if (!data.length) return [];
      const res = await (tx || db)(tableName)
        .insert(data as never)
        .onConflict(onConflictField as never)
        .merge(mergeColumns)
        .returning("*");
      return res as Tables[Tname]["base"][];
    } catch (error) {
      throw new DatabaseError({ error, name: "Create" });
    }
  },
  updateById: async (id, { $incr, $decr, ...data }, tx): Promise<Tables[Tname]["base"]> => {
    try {
      const query = (tx || db)(tableName)
        .where({ id } as never)
        .update(data as never)
        .returning("*");
      if ($incr) {
        Object.entries($incr).forEach(([incrementField, incrementValue]) => {
          void query.increment(incrementField, incrementValue as number);
        });
      }
      if ($decr) {
        Object.entries($decr).forEach(([incrementField, incrementValue]) => {
          void query.decrement(incrementField, incrementValue as number);
        });
      }
      const [docs] = await query;
      return docs as Tables[Tname]["base"];
    } catch (error) {
      throw new DatabaseError({ error, name: "Update by id" });
    }
  },
  update: async (filter, { $incr, $decr, ...data }, tx): Promise<Tables[Tname]["base"][]> => {
    try {
      const query = (tx || db)(tableName)
        .where(buildFindFilter(filter))
        .update(data as never)
        .returning("*");
      // increment and decrement operation in update
      if ($incr) {
        Object.entries($incr).forEach(([incrementField, incrementValue]) => {
          void query.increment(incrementField, incrementValue as number);
        });
      }
      if ($decr) {
        Object.entries($decr).forEach(([incrementField, incrementValue]) => {
          void query.decrement(incrementField, incrementValue as number);
        });
      }
      return (await query) as Tables[Tname]["base"][];
    } catch (error) {
      throw new DatabaseError({ error, name: "Update" });
    }
  },
  deleteById: async (id, tx): Promise<Tables[Tname]["base"]> => {
    try {
      const [res] = await (tx || db)(tableName)
        .where({ id } as never)
        .delete()
        .returning("*");
      return res as Tables[Tname]["base"];
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete by id" });
    }
  },
  countDocuments: async (tx): Promise<number> => {
    try {
      const [res] = await (tx || db)(tableName).count({ count: "*" }).returning("*");
      return Number((res as { count: number }).count || 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete by id" });
    }
  },
  delete: async (filter, tx): Promise<Tables[Tname]["base"][]> => {
    try {
      const res = await (tx || db)(tableName).where(buildFindFilter(filter)).delete().returning("*");
      return res as Tables[Tname]["base"][];
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete" });
    }
  },
  ...(dal || {})
});
