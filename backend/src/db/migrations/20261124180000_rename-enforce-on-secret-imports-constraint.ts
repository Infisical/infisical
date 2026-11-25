import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `UPDATE ??
     SET constraints = jsonb_set(
       constraints #- '{constraints,enforceImportReplication}',
       '{constraints,enforceOnSecretImports}',
       constraints -> 'constraints' -> 'enforceImportReplication'
     )
     WHERE type = 'secret-change' AND constraints -> 'constraints' -> 'enforceImportReplication' IS NOT NULL`,
    [TableName.ApprovalPolicies]
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `UPDATE ??
     SET constraints = jsonb_set(
       constraints #- '{constraints,enforceOnSecretImports}',
       '{constraints,enforceImportReplication}',
       constraints -> 'constraints' -> 'enforceOnSecretImports'
     )
     WHERE type = 'secret-change' AND constraints -> 'constraints' -> 'enforceOnSecretImports' IS NOT NULL`,
    [TableName.ApprovalPolicies]
  );
}
