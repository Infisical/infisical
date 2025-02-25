import { Knex } from "knex";
import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // First drop the existing constraint
  await knex.raw(`ALTER TABLE ${TableName.DedicatedInstances} DROP CONSTRAINT IF EXISTS dedicated_instances_status_check`);
  
  // Add the new constraint with updated enum values
  await knex.raw(`ALTER TABLE ${TableName.DedicatedInstances} ADD CONSTRAINT dedicated_instances_status_check CHECK (status IN ('RUNNING', 'UPGRADING', 'PROVISIONING', 'FAILED'))`);
}

export async function down(knex: Knex): Promise<void> {
  // Revert back to original constraint
  await knex.raw(`ALTER TABLE ${TableName.DedicatedInstances} DROP CONSTRAINT IF EXISTS dedicated_instances_status_check`);
  await knex.raw(`ALTER TABLE ${TableName.DedicatedInstances} ADD CONSTRAINT dedicated_instances_status_check CHECK (status IN ('RUNNING', 'UPGRADING', 'PROVISIONING'))`);
} 