import { Knex } from "knex";

import { UnauthorizedError } from "../errors";

type TKnexDynamicPrimitiveOperator = {
  operator: "eq" | "ne" | "startsWith" | "endsWith";
  value: string;
  field: string;
};

type TKnexDynamicInOperator = {
  operator: "in";
  value: string[] | number[];
  field: string;
};

type TKnexNonGroupOperator = TKnexDynamicInOperator | TKnexDynamicPrimitiveOperator;

type TKnexGroupOperator = {
  operator: "and" | "or" | "not";
  value: (TKnexNonGroupOperator | TKnexGroupOperator)[];
};

// akhilmhdh: This is still in pending state and not yet ready. If you want to use it ping me.
// used when you need to write a complex query with the orm
// use it when you need complex or and and condition - most of the time not needed
// majorly used with casl permission to filter data based on permission
export type TKnexDynamicOperator = TKnexGroupOperator | TKnexNonGroupOperator;

export const buildDynamicKnexQuery = (dynamicQuery: TKnexDynamicOperator, rootQueryBuild: Knex.QueryBuilder) => {
  const stack = [{ filterAst: dynamicQuery, queryBuilder: rootQueryBuild }];

  while (stack.length) {
    const { filterAst, queryBuilder } = stack.pop()!;
    switch (filterAst.operator) {
      case "eq": {
        void queryBuilder.where(filterAst.field, "=", filterAst.value);
        break;
      }
      case "ne": {
        void queryBuilder.whereNot(filterAst.field, filterAst.value);
        break;
      }
      case "startsWith": {
        void queryBuilder.whereILike(filterAst.field, `${filterAst.value}%`);
        break;
      }
      case "endsWith": {
        void queryBuilder.whereILike(filterAst.field, `%${filterAst.value}`);
        break;
      }
      case "and": {
        void queryBuilder.andWhere((subQueryBuilder) => {
          filterAst.value.forEach((el) => {
            stack.push({
              queryBuilder: subQueryBuilder,
              filterAst: el
            });
          });
        });
        break;
      }
      case "or": {
        void queryBuilder.orWhere((subQueryBuilder) => {
          filterAst.value.forEach((el) => {
            stack.push({
              queryBuilder: subQueryBuilder,
              filterAst: el
            });
          });
        });
        break;
      }
      case "not": {
        void queryBuilder.whereNot((subQueryBuilder) => {
          filterAst.value.forEach((el) => {
            stack.push({
              queryBuilder: subQueryBuilder,
              filterAst: el
            });
          });
        });
        break;
      }
      default:
        throw new UnauthorizedError({ message: `Invalid knex dynamic operator: ${filterAst.operator}` });
    }
  }
};
