import { Knex } from "knex";
import { Tables } from "knex/types/tables";

import { TableName } from "@app/db/schemas";

export const selectAllTableCols = <Tname extends keyof Tables>(tableName: Tname) =>
  `${tableName}.*` as keyof Tables[Tname]["base"];

// use it for data migration between different tables with the samed id
export const rowWithSameIdIn = (otherTable: TableName, table: TableName) => (qb: Knex.QueryBuilder) => {
  void qb.select(`${otherTable}.id`).from(otherTable).whereRaw(`"${otherTable}"."id" = "${table}"."id"`);
};

export const stripUndefinedInWhere = <T extends object>(val: T): Exclude<T, undefined> => {
  const copy = val;
  Object.entries(copy).forEach(([key, value]) => {
    if (typeof value === "undefined") {
      delete copy[key as keyof T];
    }
  });
  return copy as Exclude<T, undefined>;
};

// if its undefined its skipped in knex
// if its empty string its set as null
// else pass to the required one
export const setKnexStringValue = <T>(
  value: string | null | undefined,
  cb: (arg: string) => T,
  allowEmptyString?: boolean
) => {
  if (typeof value === "undefined") return;
  if ((value === "" && !allowEmptyString) || value === null) return null;
  return cb(value);
};
