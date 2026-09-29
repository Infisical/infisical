import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AgentVaultVariable))) {
    await knex.schema.createTable(TableName.AgentVaultVariable, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("accessBundleId").notNullable();
      t.foreign("accessBundleId").references("id").inTable(TableName.AgentVaultAccessBundle).onDelete("CASCADE");

      t.string("key", 64).notNullable();
      t.binary("encryptedValue").notNullable();
      // Every value is sealed either way. The flag only decides whether an admin sees it without a reveal.
      t.boolean("isSecret").notNullable().defaultTo(true);

      t.timestamps(true, true, true);

      // Also the index the accessBundleId foreign key needs, as its leftmost column.
      t.unique(["accessBundleId", "key"]);
    });

    await createOnUpdateTrigger(knex, TableName.AgentVaultVariable);
  }

  if (!(await knex.schema.hasTable(TableName.AgentVaultServiceVariableReference))) {
    await knex.schema.createTable(TableName.AgentVaultServiceVariableReference, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("serviceId").notNullable();
      t.foreign("serviceId").references("id").inTable(TableName.AgentVaultService).onDelete("CASCADE");
      t.index("serviceId");

      // Deferred, not the NO ACTION default. A bundle delete cascades to its services and its variables in
      // one statement, and an immediate check can run before the service cascade has removed these rows,
      // depending on which constraint was created first. Checked at commit, deleting a variable that is
      // still referenced is refused all the same.
      t.uuid("variableId").notNullable();
      t.foreign("variableId").references("id").inTable(TableName.AgentVaultVariable).deferrable("deferred");
      t.index("variableId");

      t.string("field", 32).notNullable();

      t.uuid("customHeaderId");
      t.foreign("customHeaderId").references("id").inTable(TableName.AgentVaultServiceCustomHeader).onDelete("CASCADE");
      t.index("customHeaderId");

      t.uuid("substitutionId");
      t.foreign("substitutionId").references("id").inTable(TableName.AgentVaultServiceSubstitution).onDelete("CASCADE");
      t.index("substitutionId");

      t.boolean("isWholeValue").notNullable();

      t.timestamps(true, true, true);
    });

    await knex.raw(
      `ALTER TABLE "${TableName.AgentVaultServiceVariableReference}" ADD CONSTRAINT "agent_vault_service_variable_references_field_check" CHECK (
        ("field" = 'custom-header' AND "customHeaderId" IS NOT NULL AND "substitutionId" IS NULL)
        OR ("field" = 'substitution' AND "substitutionId" IS NOT NULL AND "customHeaderId" IS NULL)
        OR ("field" IN ('credential-value', 'credential-username') AND "customHeaderId" IS NULL AND "substitutionId" IS NULL)
      )`
    );

    await createOnUpdateTrigger(knex, TableName.AgentVaultServiceVariableReference);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AgentVaultServiceVariableReference);
  await dropOnUpdateTrigger(knex, TableName.AgentVaultServiceVariableReference);

  await knex.schema.dropTableIfExists(TableName.AgentVaultVariable);
  await dropOnUpdateTrigger(knex, TableName.AgentVaultVariable);
}
