import { Knex } from "knex";
import { Tables } from "knex/types/tables";

export const selectAllTableCols = <Tname extends keyof Tables>(db: Knex, tableName: Tname) =>
  db.ref("*").withSchema(tableName) as unknown as keyof Tables[Tname];
