import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const UNSETTLED_REVOCATION_INDEX = "pki_signer_revocations_one_unsettled_per_signer";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PkiSignerCertificateRevocations))) {
    await knex.schema.createTable(TableName.PkiSignerCertificateRevocations, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("signerId").notNullable();
      t.foreign("signerId").references("id").inTable(TableName.PkiSigners).onDelete("CASCADE");
      t.uuid("certificateId").notNullable();
      t.foreign("certificateId").references("id").inTable(TableName.Certificate).onDelete("CASCADE");
      t.string("status").notNullable();
      t.string("revocationReason").notNullable();
      t.string("previousSignerStatus").notNullable();
      t.integer("caRequestId").nullable();
      t.text("failureReason").nullable();
      t.timestamps(true, true, true);
      t.index(["signerId", "createdAt"]);
      t.index(["status"]);
    });
    await knex.raw(
      `CREATE UNIQUE INDEX ?? ON ?? ("signerId") WHERE "status" IN ('submitting', 'awaiting_approval', 'failed')`,
      [UNSETTLED_REVOCATION_INDEX, TableName.PkiSignerCertificateRevocations]
    );
    await createOnUpdateTrigger(knex, TableName.PkiSignerCertificateRevocations);
  }

  if (!(await knex.schema.hasColumn(TableName.PkiSignerCertificateIssuanceJobs, "cancelReason"))) {
    await knex.schema.alterTable(TableName.PkiSignerCertificateIssuanceJobs, (t) => {
      t.string("cancelReason").nullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.PkiSigners, "nextAutoRenewalAt"))) {
    await knex.schema.alterTable(TableName.PkiSigners, (t) => {
      t.datetime("nextAutoRenewalAt").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PkiSigners, "nextAutoRenewalAt")) {
    await knex.schema.alterTable(TableName.PkiSigners, (t) => {
      t.dropColumn("nextAutoRenewalAt");
    });
  }
  if (await knex.schema.hasColumn(TableName.PkiSignerCertificateIssuanceJobs, "cancelReason")) {
    await knex.schema.alterTable(TableName.PkiSignerCertificateIssuanceJobs, (t) => {
      t.dropColumn("cancelReason");
    });
  }
  await dropOnUpdateTrigger(knex, TableName.PkiSignerCertificateRevocations);
  await knex.schema.dropTableIfExists(TableName.PkiSignerCertificateRevocations);
}
