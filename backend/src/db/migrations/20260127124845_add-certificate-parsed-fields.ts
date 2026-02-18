import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIsCA = await knex.schema.hasColumn(TableName.Certificate, "isCA");

  if (!hasIsCA) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      // Subject attributes (commonName already exists)
      t.string("subjectOrganization").nullable();
      t.string("subjectOrganizationalUnit").nullable();
      t.string("subjectCountry").nullable();
      t.string("subjectState").nullable();
      t.string("subjectLocality").nullable();

      // Fingerprints
      t.string("fingerprintSha256").nullable();
      t.string("fingerprintSha1").nullable();

      // Basic constraints
      t.boolean("isCA").nullable();
      t.integer("pathLength").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasIsCA = await knex.schema.hasColumn(TableName.Certificate, "isCA");

  if (hasIsCA) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.dropColumn("isCA");
      t.dropColumn("pathLength");
      t.dropColumn("fingerprintSha256");
      t.dropColumn("fingerprintSha1");
      t.dropColumn("subjectOrganization");
      t.dropColumn("subjectOrganizationalUnit");
      t.dropColumn("subjectCountry");
      t.dropColumn("subjectState");
      t.dropColumn("subjectLocality");
    });
  }
}
