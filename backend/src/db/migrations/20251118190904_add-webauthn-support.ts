import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.WebAuthnCredential))) {
    await knex.schema.createTable(TableName.WebAuthnCredential, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.text("credentialId").notNullable(); // base64url encoded credential ID
      t.text("publicKey").notNullable(); // base64url encoded public key
      t.bigInteger("counter").defaultTo(0).notNullable(); // signature counter for replay protection
      t.specificType("transports", "text[]").nullable(); // transport methods
      t.string("name").nullable(); // user-friendly name
      t.timestamp("lastUsedAt").nullable();
      t.timestamps(true, true, true);
      t.unique("credentialId"); // credential IDs must be unique across all users
      t.index("userId"); // index for fast lookups by user
    });

    await createOnUpdateTrigger(knex, TableName.WebAuthnCredential);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Mirror the conditional in up(): only drop the trigger when the table
  // exists. dropOnUpdateTrigger emits `DROP TRIGGER IF EXISTS x ON table`
  // — the `IF EXISTS` only swallows missing-trigger errors; Postgres still
  // refuses to parse the `ON table` clause when the relation is gone, so
  // rolling back on a DB that never ran up() (or that already dropped the
  // table by another path) errors out.
  if (await knex.schema.hasTable(TableName.WebAuthnCredential)) {
    await dropOnUpdateTrigger(knex, TableName.WebAuthnCredential);
    await knex.schema.dropTable(TableName.WebAuthnCredential);
  }
}
