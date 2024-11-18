import { Tables } from "knex/types/tables";

export const selectAllTableCols = <Tname extends keyof Tables>(tableName: Tname) =>
  `${tableName}.*` as keyof Tables[Tname]["base"];

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
export const setKnexStringValue = <T>(value: string | null | undefined, cb: (arg: string) => T) => {
  if (typeof value === "undefined") return;
  if (value === "" || value === null) return null;
  return cb(value);
};
