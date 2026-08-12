import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  // One policy per Endpoint project, matching the one-project-per-org model the rest of the product
  // uses, so an admin configures scanning once for the fleet rather than per device.
  if (!(await knex.schema.hasTable(TableName.EndpointScanPolicy))) {
    await knex.schema.createTable(TableName.EndpointScanPolicy, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.unique(["projectId"]);

      t.boolean("isEnabled").notNullable().defaultTo(false);

      // Roots and exclusions are lists the admin edits as a whole, never queried individually.
      t.jsonb("roots").notNullable();
      t.jsonb("excludePatterns");

      t.integer("maxFileMegabytes");
      t.integer("intervalHours").notNullable().defaultTo(24);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.EndpointScanPolicy);
  }

  // Per-device scan state. Separate from endpoint_devices so this beat adds no columns to a table the
  // network-policy work also writes to. It carries both halves of the loop: the request an admin made,
  // and the summary of what came back.
  if (!(await knex.schema.hasTable(TableName.EndpointDeviceScan))) {
    await knex.schema.createTable(TableName.EndpointDeviceScan, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("deviceId").notNullable();
      t.foreign("deviceId").references("id").inTable(TableName.EndpointDevice).onDelete("CASCADE");
      t.unique(["deviceId"]);

      // Changing this is the entire "Scan now" mechanism: the agent polls the policy, sees an id it has
      // not run yet, and scans. No push channel to the device is needed.
      t.uuid("scanRequestId");
      t.datetime("requestedAt");

      t.datetime("lastScanStartedAt");
      t.datetime("lastScanFinishedAt");
      t.string("lastTrigger");
      t.integer("filesScanned");
      t.integer("findingCount");

      // Roots macOS refused to let the agent read. A scan that could read nothing must not be
      // presentable as a clean device, so the console needs this to tell the two apart.
      t.jsonb("inaccessibleRoots");
      t.jsonb("rootsScanned");
      t.boolean("truncated").notNullable().defaultTo(false);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.EndpointDeviceScan);
  }

  if (!(await knex.schema.hasTable(TableName.EndpointSecretFinding))) {
    await knex.schema.createTable(TableName.EndpointSecretFinding, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.uuid("deviceId").notNullable();
      t.foreign("deviceId").references("id").inTable(TableName.EndpointDevice).onDelete("CASCADE");
      t.index("deviceId");

      // The agent's own identifier for a finding: file, rule and line. Text rather than a varchar
      // because it contains an absolute path, and the same reason applies to file below.
      t.text("fingerprint").notNullable();
      t.unique(["deviceId", "fingerprint"]);

      t.string("ruleId").notNullable();
      t.text("description");
      t.text("file").notNullable();
      t.integer("startLine").notNullable();
      t.float("entropy");

      // The matched text with the credential already replaced on the device. There is deliberately no
      // column for the secret itself: the plaintext never leaves the machine.
      t.text("redactedMatch");
      t.datetime("fileModifiedAt");

      t.string("status").notNullable().defaultTo("open");

      // firstSeenAt survives re-reporting, so the console can say how long a credential has been sitting
      // on the device rather than only that the last scan saw it.
      t.datetime("firstSeenAt").notNullable();
      t.datetime("lastSeenAt").notNullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.EndpointSecretFinding);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.EndpointSecretFinding);
  await dropOnUpdateTrigger(knex, TableName.EndpointSecretFinding);

  await knex.schema.dropTableIfExists(TableName.EndpointDeviceScan);
  await dropOnUpdateTrigger(knex, TableName.EndpointDeviceScan);

  await knex.schema.dropTableIfExists(TableName.EndpointScanPolicy);
  await dropOnUpdateTrigger(knex, TableName.EndpointScanPolicy);
}
