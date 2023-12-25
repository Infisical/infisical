import { Tables } from "knex/types/tables";

export const selectAllTableCols = <Tname extends keyof Tables>(tableName: Tname) =>
  `${tableName}.*` as keyof Tables[Tname]["base"];
