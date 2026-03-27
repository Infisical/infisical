import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PamResourceRotationRule))) {
    await knex.schema.createTable(TableName.PamResourceRotationRule, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("resourceId").notNullable();
      t.foreign("resourceId").references("id").inTable(TableName.PamResource).onDelete("CASCADE");
      t.string("name").nullable();
      t.string("namePattern").notNullable();
      t.boolean("enabled").notNullable().defaultTo(true);
      t.integer("intervalSeconds").nullable();
      t.integer("priority").notNullable();
      t.timestamps(true, true, true);
      t.unique(["resourceId", "priority"]);
    });
  }

  if (!(await knex.schema.hasColumn(TableName.PamAccountDependency, "syncStatus"))) {
    await knex.schema.alterTable(TableName.PamAccountDependency, (t) => {
      t.string("syncStatus").nullable();
    });
  }
  if (!(await knex.schema.hasColumn(TableName.PamAccountDependency, "lastSyncedAt"))) {
    await knex.schema.alterTable(TableName.PamAccountDependency, (t) => {
      t.timestamp("lastSyncedAt").nullable();
    });
  }
  if (!(await knex.schema.hasColumn(TableName.PamAccountDependency, "encryptedLastSyncMessage"))) {
    await knex.schema.alterTable(TableName.PamAccountDependency, (t) => {
      t.binary("encryptedLastSyncMessage").nullable();
    });
  }

  // Migrate existing per-account rotation configs to rules
  if (await knex.schema.hasColumn(TableName.PamAccount, "rotationEnabled")) {
    const accountsWithRotation = await knex(TableName.PamAccount)
      .where("rotationEnabled", true)
      .whereNotNull("rotationIntervalSeconds")
      .select("resourceId", "name", "rotationIntervalSeconds");

    if (accountsWithRotation.length > 0) {
      // Group by resourceId to assign sequential priorities
      const byResource: Record<string, Array<{ name: string; rotationIntervalSeconds: number }>> = {};
      for (const account of accountsWithRotation) {
        if (!byResource[account.resourceId]) {
          byResource[account.resourceId] = [];
        }
        byResource[account.resourceId].push({
          name: account.name,
          rotationIntervalSeconds: account.rotationIntervalSeconds ?? 2592000
        });
      }

      const rulesToInsert = [];
      for (const [resourceId, accounts] of Object.entries(byResource)) {
        for (let i = 0; i < accounts.length; i += 1) {
          rulesToInsert.push({
            resourceId,
            name: accounts[i].name,
            namePattern: accounts[i].name,
            enabled: true,
            intervalSeconds: accounts[i].rotationIntervalSeconds,
            priority: i + 1
          });
        }
      }

      if (rulesToInsert.length > 0) {
        await knex(TableName.PamResourceRotationRule).insert(rulesToInsert);
      }
    }
  }

  // Drop old per-account rotation config columns
  if (await knex.schema.hasColumn(TableName.PamAccount, "rotationEnabled")) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("rotationEnabled");
    });
  }
  if (await knex.schema.hasColumn(TableName.PamAccount, "rotationIntervalSeconds")) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("rotationIntervalSeconds");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Re-add per-account rotation columns
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "rotationEnabled"))) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.boolean("rotationEnabled").notNullable().defaultTo(false);
    });
  }
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "rotationIntervalSeconds"))) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.integer("rotationIntervalSeconds").nullable();
    });
  }

  // Drop sync columns from dependencies
  if (await knex.schema.hasColumn(TableName.PamAccountDependency, "syncStatus")) {
    await knex.schema.alterTable(TableName.PamAccountDependency, (t) => {
      t.dropColumn("syncStatus");
    });
  }
  if (await knex.schema.hasColumn(TableName.PamAccountDependency, "lastSyncedAt")) {
    await knex.schema.alterTable(TableName.PamAccountDependency, (t) => {
      t.dropColumn("lastSyncedAt");
    });
  }
  if (await knex.schema.hasColumn(TableName.PamAccountDependency, "encryptedLastSyncMessage")) {
    await knex.schema.alterTable(TableName.PamAccountDependency, (t) => {
      t.dropColumn("encryptedLastSyncMessage");
    });
  }

  // Drop rotation rules table
  await knex.schema.dropTableIfExists(TableName.PamResourceRotationRule);
}
