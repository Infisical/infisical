import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";

export const dropConstraintIfExists = (tableName: TableName, constraintName: string, knex: Knex) =>
  knex.raw("ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??;", [tableName, constraintName]);
