import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SshCertificateAuthority, "keySource"))) {
    await knex.schema.alterTable(TableName.SshCertificateAuthority, (t) => {
      t.string("keySource");
    });

    // Backfilling the keySource to internal
    await knex(TableName.SshCertificateAuthority).update({ keySource: "internal" });

    await knex.schema.alterTable(TableName.SshCertificateAuthority, (t) => {
      t.string("keySource").notNullable().alter();
    });
  }

  if (await knex.schema.hasColumn(TableName.SshCertificate, "sshCaId")) {
    await knex.schema.alterTable(TableName.SshCertificate, (t) => {
      t.uuid("sshCaId").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SshCertificateAuthority, "keySource")) {
    await knex.schema.alterTable(TableName.SshCertificateAuthority, (t) => {
      t.dropColumn("keySource");
    });
  }
}
