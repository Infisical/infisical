import { Knex } from "knex";

import { TableName } from "../schemas";
import { dropConstraintIfExists } from "./utils/dropConstraintIfExists";

const UNIQUE_CONSTRAINT_NAME = "internal_kms_key_version_internalkmsid_version_unique";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.InternalKmsKeyVersion)) {
    await knex.schema.alterTable(TableName.InternalKmsKeyVersion, (t) => {
      // also serves as the FK index on internalKmsId (leftmost column)
      t.unique(["internalKmsId", "version"], { indexName: UNIQUE_CONSTRAINT_NAME });
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.InternalKmsKeyVersion)) {
    await dropConstraintIfExists(TableName.InternalKmsKeyVersion, UNIQUE_CONSTRAINT_NAME, knex);
  }
}
