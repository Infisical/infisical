import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateAuthority)) {
    const hasActiveCaCertVersionColumn = await knex.schema.hasColumn(
      TableName.CertificateAuthority,
      "activeCaCertVersion"
    );
    if (!hasActiveCaCertVersionColumn) {
      await knex.schema.alterTable(TableName.CertificateAuthority, (t) => {
        t.integer("activeCaCertVersion").nullable();
      });

      await knex(TableName.CertificateAuthority).where("status", "active").update({ activeCaCertVersion: 1 });
    }
  }

  if (await knex.schema.hasTable(TableName.CertificateAuthorityCert)) {
    const hasVersionColumn = await knex.schema.hasColumn(TableName.CertificateAuthorityCert, "version");
    if (!hasVersionColumn) {
      await knex.schema.alterTable(TableName.CertificateAuthorityCert, (t) => {
        t.integer("version").nullable();
        // t.dropUnique(["caId"]);
      });

      await knex(TableName.CertificateAuthorityCert).update({ version: 1 }).whereNull("version");

      await knex.schema.alterTable(TableName.CertificateAuthorityCert, (t) => {
        t.integer("version").notNullable().alter();
      });
    }

    const hasCaSecretIdColumn = await knex.schema.hasColumn(TableName.CertificateAuthorityCert, "caSecretId");
    if (!hasCaSecretIdColumn) {
      await knex.schema.alterTable(TableName.CertificateAuthorityCert, (t) => {
        t.uuid("caSecretId").nullable();
        t.foreign("caSecretId").references("id").inTable(TableName.CertificateAuthoritySecret).onDelete("CASCADE");
      });

      await knex.raw(`
        UPDATE "${TableName.CertificateAuthorityCert}" cert
        SET "caSecretId" = (
          SELECT sec.id
          FROM "${TableName.CertificateAuthoritySecret}" sec
          WHERE sec."caId" = cert."caId"
        )
      `);

      //   await knex.raw(`
      //       UPDATE ${TableName.CertificateAuthorityCert} cert
      //       SET caSecretId = (
      //         SELECT sec.id
      //         FROM ${TableName.CertificateAuthoritySecret} sec
      //         WHERE sec."caId" = cert."caId"
      //       )
      //     `);

      //   await knex(TableName.CertificateAuthorityCert).update({
      //     caSecretId: knex(TableName.CertificateAuthoritySecret)
      //       .select("id")
      //       .whereRaw("?? = ??", ["CertificateAuthoritySecret.caId", "CertificateAuthorityCert.caId"])
      //   });

      //   await knex(TableName.CertificateAuthorityCert).update({
      //     caSecretId: function () {
      //       this.select("id")
      //         .from(TableName.CertificateAuthoritySecret)
      //         .whereRaw("??.?? = ??.??", [
      //           TableName.CertificateAuthoritySecret,
      //           "caId",
      //           TableName.CertificateAuthorityCert,
      //           "caId"
      //         ]);
      //     }
      //   });

      await knex.schema.alterTable(TableName.CertificateAuthorityCert, (t) => {
        t.uuid("caSecretId").notNullable().alter();
      });
    }
  }

  //   if (await knex.schema.hasTable(TableName.CertificateAuthoritySecret)) {
  //     await knex.schema.alterTable(TableName.CertificateAuthoritySecret, (t) => {
  //       t.dropUnique(["caId"]);
  //     });
  //   }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateAuthority)) {
    if (await knex.schema.hasColumn(TableName.CertificateAuthority, "activeCaCertVersion")) {
      await knex.schema.alterTable(TableName.CertificateAuthority, (t) => {
        t.dropColumn("activeCaCertVersion");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.CertificateAuthorityCert)) {
    if (await knex.schema.hasColumn(TableName.CertificateAuthorityCert, "version")) {
      await knex.schema.alterTable(TableName.CertificateAuthorityCert, (t) => {
        t.dropColumn("version");
      });
    }

    if (await knex.schema.hasColumn(TableName.CertificateAuthorityCert, "caSecretId")) {
      await knex.schema.alterTable(TableName.CertificateAuthorityCert, (t) => {
        t.dropColumn("caSecretId");
      });
    }
  }
}
