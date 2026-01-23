import { Knex } from "knex";
import { Compare, Filter, parse } from "scim2-parse-filter";

import { TableName } from "@app/db/schemas/models";

const appendParentToGroupingOperator = (parentPath: string, filter: Filter) => {
  if (filter.op !== "[]" && filter.op !== "and" && filter.op !== "or" && filter.op !== "not") {
    return { ...filter, attrPath: `${parentPath}.${(filter as Compare).attrPath}` };
  }
  return filter;
};

const processDynamicQuery = (
  rootQuery: Knex.QueryBuilder,
  scimRootFilterAst: Filter,
  getAttributeField: (attr: string) => string | null,
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
    switch (scimFilterAst.op) {
      case "eq": {
        let sanitizedValue = scimFilterAst.compValue;
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath === `${TableName.Users}.email` && typeof sanitizedValue === "string") {
          sanitizedValue = sanitizedValue.toLowerCase();
        }
        if (attrPath) void query.where(attrPath, sanitizedValue);
        break;
      }
      case "pr": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.whereNotNull(attrPath);
        break;
      }
      case "gt": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.where(attrPath, ">", scimFilterAst.compValue);
        break;
      }
      case "ge": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.where(attrPath, ">=", scimFilterAst.compValue);
        break;
      }
      case "lt": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.where(attrPath, "<", scimFilterAst.compValue);
        break;
      }
      case "le": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.where(attrPath, "<=", scimFilterAst.compValue);
        break;
      }
      case "sw": {
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath) void query.whereILike(attrPath, `${scimFilterAst.compValue}%`);
        break;
      }
      case "ew": {
        let sanitizedValue = scimFilterAst.compValue;
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath === `${TableName.Users}.email` && typeof sanitizedValue === "string") {
          sanitizedValue = sanitizedValue.toLowerCase();
        }
        if (attrPath) void query.whereILike(attrPath, `%${sanitizedValue}`);
        break;
      }
      case "co": {
        let sanitizedValue = scimFilterAst.compValue;
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath === `${TableName.Users}.email` && typeof sanitizedValue === "string") {
          sanitizedValue = sanitizedValue.toLowerCase();
        }
        if (attrPath) void query.whereILike(attrPath, `%${sanitizedValue}%`);
        break;
      }
      case "ne": {
        let sanitizedValue = scimFilterAst.compValue;
        const attrPath = getAttributeField(scimFilterAst.attrPath);
        if (attrPath === `${TableName.Users}.email` && typeof sanitizedValue === "string") {
          sanitizedValue = sanitizedValue.toLowerCase();
        }
        if (attrPath) void query.whereNot(attrPath, "=", sanitizedValue);
        break;
      }
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
  getAttributeField: (attr: string) => string | null
) => {
  const scimRootFilterAst = parse(rootScimFilter);
  return processDynamicQuery(rootQuery, scimRootFilterAst, getAttributeField);
};
