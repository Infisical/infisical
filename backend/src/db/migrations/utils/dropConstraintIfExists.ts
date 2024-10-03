import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export const dropConstraintIfExists = (tableName: TableName, constraintName: string, knex: Knex) =>
  knex.raw(`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${constraintName};`);
