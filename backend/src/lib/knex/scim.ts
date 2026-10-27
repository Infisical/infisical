import { Knex } from "knex";
import { Compare, Filter, parse, Suffix } from "scim2-parse-filter";

import { TableName } from "@app/db/schemas";

import { BadRequestError } from "../errors";
import { sanitizeSqlLikeString } from "../fn";

export type TScimCompareOp = Compare["op"] | "pr";
export type TScimCompareValue = Compare["compValue"] | undefined;

export type TScimAttributeHandler = (query: Knex.QueryBuilder, op: TScimCompareOp, value: TScimCompareValue) => void;

export type TScimAttributeResolver = (attrPath: string) => string | TScimAttributeHandler | null;

const isScimCompareOp = (filter: Filter): filter is Compare | Suffix =>
  filter.op !== "and" && filter.op !== "or" && filter.op !== "not" && filter.op !== "[]";

const appendParentToGroupingOperator = (parentPath: string, filter: Filter) => {
  if (filter.op !== "[]" && filter.op !== "and" && filter.op !== "or" && filter.op !== "not") {
    return { ...filter, attrPath: `${parentPath}.${(filter as Compare).attrPath}` };
  }
  return filter;
};

export const applyScimComparison = (
  query: Knex.QueryBuilder,
  column: string,
  op: TScimCompareOp,
  rawValue: TScimCompareValue
) => {
  const value: Compare["compValue"] =
    column === `${TableName.Users}.email` && typeof rawValue === "string" ? rawValue.toLowerCase() : (rawValue ?? null);

  switch (op) {
    case "eq":
      void query.where(column, value);
      break;
    case "ne":
      void query.whereNot(column, "=", value);
      break;
    case "pr":
      void query.whereNotNull(column);
      break;
    case "gt":
      void query.where(column, ">", value);
      break;
    case "ge":
      void query.where(column, ">=", value);
      break;
    case "lt":
      void query.where(column, "<", value);
      break;
    case "le":
      void query.where(column, "<=", value);
      break;
    case "sw":
      if (!value) {
        throw new BadRequestError({ message: "compValue is required for sw filter" });
      }
      void query.whereILike(column, `${sanitizeSqlLikeString(String(value))}%`);
      break;
    case "ew":
      if (value) void query.whereILike(column, `%${sanitizeSqlLikeString(String(value))}`);
      break;
    case "co":
      if (value) void query.whereILike(column, `%${sanitizeSqlLikeString(String(value))}%`);
      break;
    default:
      break;
  }
};

const processDynamicQuery = (
  rootQuery: Knex.QueryBuilder,
  scimRootFilterAst: Filter,
  getAttributeField: TScimAttributeResolver,
  depth = 0
) => {
  if (depth > 20) return;

  const stack = [
    {
      scimFilterAst: scimRootFilterAst,
      query: rootQuery
    }
  ];

  while (stack.length) {
    const { scimFilterAst, query } = stack.pop()!;

    if (isScimCompareOp(scimFilterAst)) {
      const attr = getAttributeField(scimFilterAst.attrPath);
      const value = "compValue" in scimFilterAst ? scimFilterAst.compValue : undefined;
      if (typeof attr === "function") {
        attr(query, scimFilterAst.op, value);
      } else if (attr) {
        applyScimComparison(query, attr, scimFilterAst.op, value);
      }
      continue;
    }

    switch (scimFilterAst.op) {
      case "and": {
        scimFilterAst.filters.forEach((el) => {
          void query.andWhere((subQueryBuilder) => {
            processDynamicQuery(subQueryBuilder, el, getAttributeField, depth + 1);
          });
        });
        break;
      }
      case "or": {
        scimFilterAst.filters.forEach((el) => {
          void query.orWhere((subQueryBuilder) => {
            processDynamicQuery(subQueryBuilder, el, getAttributeField, depth + 1);
          });
        });
        break;
      }
      case "not": {
        void query.whereNot((subQueryBuilder) => {
          processDynamicQuery(subQueryBuilder, scimFilterAst.filter, getAttributeField, depth + 1);
        });
        break;
      }
      case "[]": {
        void query.where((subQueryBuilder) => {
          processDynamicQuery(
            subQueryBuilder,
            appendParentToGroupingOperator(scimFilterAst.attrPath, scimFilterAst.valFilter),
            getAttributeField,
            depth + 1
          );
        });
        break;
      }
      default:
        break;
    }
  }
};

export const generateKnexQueryFromScim = (
  rootQuery: Knex.QueryBuilder,
  rootScimFilter: string,
  getAttributeField: TScimAttributeResolver
) => {
  const scimRootFilterAst = parse(rootScimFilter);
  return processDynamicQuery(rootQuery, scimRootFilterAst, getAttributeField);
};
