import { Knex } from "knex";

import { SearchResourceOperators, TSearchResourceOperator } from "./search";

const buildKnexQuery = (
  query: Knex.QueryBuilder,
  // when it's multiple table field means it's field1 or field2
  fields: string | string[],
  operator: SearchResourceOperators,
  value: unknown
) => {
  switch (operator) {
    case SearchResourceOperators.$eq: {
      if (typeof value !== "string" && typeof value !== "number")
        throw new Error("Invalid value type for $eq operator");

      if (typeof fields === "string") {
        return void query.where(fields, "=", value);
      }

      return void query.where((qb) => {
        return fields.forEach((el, index) => {
          if (index === 0) {
            return void qb.where(el, "=", value);
          }
          return void qb.orWhere(el, "=", value);
        });
      });
    }

    case SearchResourceOperators.$neq: {
      if (typeof value !== "string" && typeof value !== "number")
        throw new Error("Invalid value type for $neq operator");

      if (typeof fields === "string") {
        return void query.where(fields, "<>", value);
      }

      return void query.where((qb) => {
        return fields.forEach((el, index) => {
          if (index === 0) {
            return void qb.where(el, "<>", value);
          }
          return void qb.orWhere(el, "<>", value);
        });
      });
    }
    case SearchResourceOperators.$in: {
      if (!Array.isArray(value)) throw new Error("Invalid value type for $in operator");

      if (typeof fields === "string") {
        return void query.whereIn(fields, value);
      }

      return void query.where((qb) => {
        return fields.forEach((el, index) => {
          if (index === 0) {
            return void qb.whereIn(el, value);
          }
          return void qb.orWhereIn(el, value);
        });
      });
    }
    case SearchResourceOperators.$contains: {
      if (typeof value !== "string") throw new Error("Invalid value type for $contains operator");

      if (typeof fields === "string") {
        return void query.whereILike(fields, `%${value}%`);
      }

      return void query.where((qb) => {
        return fields.forEach((el, index) => {
          if (index === 0) {
            return void qb.whereILike(el, `%${value}%`);
          }
          return void qb.orWhereILike(el, `%${value}%`);
        });
      });
    }
    default:
      throw new Error(`Unsupported operator: ${String(operator)}`);
  }
};

export const buildKnexFilterForSearchResource = <T extends { [K: string]: TSearchResourceOperator }, K extends keyof T>(
  rootQuery: Knex.QueryBuilder,
  searchFilter: T & { $or?: T[] },
  getAttributeField: (attr: K) => string | string[] | null
) => {
  const { $or: orFilters = [] } = searchFilter;
  (Object.keys(searchFilter) as K[]).forEach((key) => {
    // akhilmhdh: yes, we could have split in top. This is done to satisfy ts type error
    if (key === "$or") return;

    const dbField = getAttributeField(key);
    if (!dbField) throw new Error(`DB field not found for ${String(key)}`);

    const dbValue = searchFilter[key];
    if (typeof dbValue === "string" || typeof dbValue === "number") {
      buildKnexQuery(rootQuery, dbField, SearchResourceOperators.$eq, dbValue);
      return;
    }

    Object.keys(dbValue as Record<string, unknown>).forEach((el) => {
      buildKnexQuery(
        rootQuery,
        dbField,
        el as SearchResourceOperators,
        (dbValue as Record<SearchResourceOperators, unknown>)[el as SearchResourceOperators]
      );
    });
  });

  if (orFilters.length) {
    void rootQuery.andWhere((andQb) => {
      return orFilters.forEach((orFilter) => {
        return void andQb.orWhere((qb) => {
          (Object.keys(orFilter) as K[]).forEach((key) => {
            const dbField = getAttributeField(key);
            if (!dbField) throw new Error(`DB field not found for ${String(key)}`);

            const dbValue = orFilter[key];
            if (typeof dbValue === "string" || typeof dbValue === "number") {
              buildKnexQuery(qb, dbField, SearchResourceOperators.$eq, dbValue);
              return;
            }

            Object.keys(dbValue as Record<string, unknown>).forEach((el) => {
              buildKnexQuery(
                qb,
                dbField,
                el as SearchResourceOperators,
                (dbValue as Record<SearchResourceOperators, unknown>)[el as SearchResourceOperators]
              );
            });
          });
        });
      });
    });
  }
};
