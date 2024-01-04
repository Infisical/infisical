import { Tables } from "knex/types/tables";

export const selectAllTableCols = <Tname extends keyof Tables>(tableName: Tname) =>
  `${tableName}.*` as keyof Tables[Tname]["base"];

export const stripUndefinedInWhere = <T extends object>(val: T) => {
  const copy = val;
  Object.entries(copy).forEach(([key, value]) => {
    if (typeof value === "undefined") {
      delete copy[key as keyof T];
    }
  });
  return copy;
};
