import { Knex } from "knex";

import { TableName } from "../schemas";

const FINDING = TableName.SecretScanningFinding;
const LOCATION = TableName.SecretScanningFindingLocation;

// A finding becomes one secret value in one resource, and every place that value was found becomes a location of it.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(LOCATION)) return;

  await knex.schema.createTable(LOCATION, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
    t.uuid("findingId").notNullable();
    t.foreign("findingId").references("id").inTable(FINDING).onDelete("CASCADE");
    t.uuid("resourceId").notNullable();
    t.foreign("resourceId").references("id").inTable(TableName.SecretScanningResource).onDelete("CASCADE");
    t.uuid("scanId").notNullable();
    t.foreign("scanId").references("id").inTable(TableName.SecretScanningScan).onDelete("CASCADE");
    t.string("fingerprint").notNullable();
    t.string("rule").notNullable();
    t.jsonb("details").notNullable();
    t.timestamp("createdAt").notNullable().defaultTo(knex.fn.now());

    t.unique(["resourceId", "fingerprint"]);
    t.index(["findingId", "createdAt"]);
    t.index("scanId");
  });

  await knex.schema.alterTable(FINDING, (t) => {
    t.timestamp("lastDetectedAt").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(FINDING, "lastDetectedAt")) {
    await knex.schema.alterTable(FINDING, (t) => {
      t.dropColumn("lastDetectedAt");
    });
  }

  await knex.schema.dropTableIfExists(LOCATION);
}
