import { Knex } from "knex";
import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  // Create PkiAcmeEnrollmentConfig table
  if (!(await knex.schema.hasTable(TableName.PkiAcmeEnrollmentConfig))) {
    await knex.schema.createTable(TableName.PkiAcmeEnrollmentConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PkiAcmeEnrollmentConfig);
  }

  // Create PkiAcmeAccount table
  if (!(await knex.schema.hasTable(TableName.PkiAcmeAccount))) {
    await knex.schema.createTable(TableName.PkiAcmeAccount, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      // Foreign key to PkiCertificateProfile
      t.uuid("profileId").notNullable();
      t.foreign("profileId").references("id").inTable(TableName.PkiCertificateProfile).onDelete("CASCADE");

      // Multi-value emails array
      t.specificType("emails", "text[]").notNullable();

      // Public key (PEM format)
      t.text("publicKey").notNullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PkiAcmeAccount);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop PkiAcmeAccount table first (depends on PkiAcmeEnrollmentConfig)
  if (await knex.schema.hasTable(TableName.PkiAcmeAccount)) {
    await knex.schema.dropTable(TableName.PkiAcmeAccount);
    await dropOnUpdateTrigger(knex, TableName.PkiAcmeAccount);
  }

  if (await knex.schema.hasTable(TableName.PkiAcmeEnrollmentConfig)) {
    await knex.schema.dropTable(TableName.PkiAcmeEnrollmentConfig);
    await dropOnUpdateTrigger(knex, TableName.PkiAcmeEnrollmentConfig);
  }
}
