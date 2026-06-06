import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.CertificateRequests))) {
    await knex.schema.createTable(TableName.CertificateRequests, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.string("status").notNullable();
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("profileId").nullable();
      t.foreign("profileId").references("id").inTable(TableName.PkiCertificateProfile).onDelete("SET NULL");
      t.uuid("caId").nullable();
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("SET NULL");
      t.uuid("certificateId").nullable();
      t.foreign("certificateId").references("id").inTable(TableName.Certificate).onDelete("SET NULL");
      t.text("csr").nullable();
      t.string("commonName").nullable();
      t.text("altNames").nullable();
      t.specificType("keyUsages", "text[]").nullable();
      t.specificType("extendedKeyUsages", "text[]").nullable();
      t.datetime("notBefore").nullable();
      t.datetime("notAfter").nullable();
      t.string("keyAlgorithm").nullable();
      t.string("signatureAlgorithm").nullable();
      t.text("errorMessage").nullable();
      t.text("metadata").nullable();

      t.index(["projectId"]);
      t.index(["status"]);
      t.index(["profileId"]);
      t.index(["caId"]);
      t.index(["certificateId"]);
      t.index(["createdAt"]);
    });

    // The trigger must be created inside the hasTable guard (so the migration
    // is idempotent on re-run) but outside the createTable callback — Knex
    // 3.x does not await async callbacks passed to createTable, so awaiting
    // createOnUpdateTrigger inside the callback would make the trigger
    // creation fire-and-forget and the migration would return before the
    // CREATE TRIGGER DDL had been issued. The other migrations in this repo
    // that guard createOnUpdateTrigger (e.g. 20260401124650_certificate-
    // inventory-views.ts, 20260413000001_gateway-enrollment-tokens.ts) place
    // the call in this position: inside the hasTable guard, outside the
    // createTable callback.
    await createOnUpdateTrigger(knex, TableName.CertificateRequests);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.CertificateRequests);
  await dropOnUpdateTrigger(knex, TableName.CertificateRequests);
}
