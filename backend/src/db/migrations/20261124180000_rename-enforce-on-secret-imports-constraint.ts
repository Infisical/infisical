import { Knex } from "knex";

import { TableName } from "../schemas";

const renameConstraintKey = async (knex: Knex, from: string, to: string) => {
  if (!(await knex.schema.hasTable(TableName.ApprovalPolicies))) return;

  await knex.raw(
    `UPDATE ??
     SET constraints = jsonb_set(
       constraints #- ARRAY['constraints', ?::text],
       ARRAY['constraints', ?::text],
       COALESCE(constraints -> 'constraints' -> ?::text, constraints -> 'constraints' -> ?::text)
     )
     WHERE type = 'secret-change'
       AND constraints -> 'constraints' -> ?::text IS NOT NULL`,
    [TableName.ApprovalPolicies, from, to, to, from, from]
  );
};

export async function up(knex: Knex): Promise<void> {
  await renameConstraintKey(knex, "enforceImportReplication", "enforceOnSecretImports");
}

export async function down(knex: Knex): Promise<void> {
  await renameConstraintKey(knex, "enforceOnSecretImports", "enforceImportReplication");
}
