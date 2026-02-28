import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasDefaultsCol = await knex.schema.hasColumn(TableName.PkiCertificateProfile, "defaults");
  if (!hasDefaultsCol) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.jsonb("defaults").nullable();
    });
  }

  const hasDefaultTtlDaysCol = await knex.schema.hasColumn(TableName.PkiCertificateProfile, "defaultTtlDays");
  if (hasDefaultTtlDaysCol) {
    const profilesWithTtl = await knex(TableName.PkiCertificateProfile).whereNotNull("defaultTtlDays");
    for await (const profile of profilesWithTtl) {
      await knex(TableName.PkiCertificateProfile)
        .where("id", profile.id)
        .update({
          defaults: JSON.stringify({ ttlDays: (profile as Record<string, unknown>).defaultTtlDays })
        });
    }

    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.dropColumn("defaultTtlDays");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasDefaultTtlDaysCol = await knex.schema.hasColumn(TableName.PkiCertificateProfile, "defaultTtlDays");
  if (!hasDefaultTtlDaysCol) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.integer("defaultTtlDays").nullable();
    });
  }

  // Extract ttlDays from defaults JSON back into defaultTtlDays
  const hasDefaultsCol = await knex.schema.hasColumn(TableName.PkiCertificateProfile, "defaults");
  if (hasDefaultsCol) {
    const profilesWithDefaults = await knex(TableName.PkiCertificateProfile).whereNotNull("defaults");
    for await (const profile of profilesWithDefaults) {
      try {
        const defaults = JSON.parse(profile.defaults as string);
        if (defaults.ttlDays) {
          await knex(TableName.PkiCertificateProfile)
            .where("id", profile.id)
            .update({
              defaultTtlDays: defaults.ttlDays
            } as Record<string, unknown>);
        }
      } catch {
        // skip malformed JSON
      }
    }

    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.dropColumn("defaults");
    });
  }
}
