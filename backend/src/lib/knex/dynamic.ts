import { Knex } from "knex";

import { UnauthorizedError } from "../errors";

type TKnexDynamicPrimitiveOperator<T extends object> = {
  operator: "eq" | "ne" | "startsWith" | "endsWith";
  value: string;
  field: Extract<keyof T, string>;
};

type TKnexDynamicInOperator<T extends object> = {
  operator: "in";
  value: string[] | number[];
  field: Extract<keyof T, string>;
};

type TKnexNonGroupOperator<T extends object> = TKnexDynamicInOperator<T> | TKnexDynamicPrimitiveOperator<T>;

type TKnexGroupOperator<T extends object> = {
  operator: "and" | "or" | "not";
  value: (TKnexNonGroupOperator<T> | TKnexGroupOperator<T>)[];
};

export type TKnexDynamicOperator<T extends object> = TKnexGroupOperator<T> | TKnexNonGroupOperator<T>;

export const buildDynamicKnexQuery = <T extends object>(
  rootQueryBuild: Knex.QueryBuilder,
  dynamicQuery: TKnexDynamicOperator<T>
) => {
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
        filterAst.value.forEach((el) => {
          void queryBuilder.andWhere((subQueryBuilder) => {
            buildDynamicKnexQuery(subQueryBuilder, el);
          });
        });
        break;
      }
      case "or": {
        filterAst.value.forEach((el) => {
          void queryBuilder.orWhere((subQueryBuilder) => {
            buildDynamicKnexQuery(subQueryBuilder, el);
          });
        });
        break;
      }
      case "not": {
        filterAst.value.forEach((el) => {
          void queryBuilder.whereNot((subQueryBuilder) => {
            buildDynamicKnexQuery(subQueryBuilder, el);
          });
        });
        break;
      }
      default:
        throw new UnauthorizedError({ message: `Invalid knex dynamic operator: ${filterAst.operator}` });
    }
  }
};
