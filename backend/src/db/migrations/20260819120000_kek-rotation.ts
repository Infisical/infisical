import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

// kms_root_config becomes a small set of rows, but the fixed sentinel id always holds the *active*
// key. That is what keeps an app version predating this feature bootable: it looks the row up by id
// and finds whatever is current. Other rows are only ever found by trial decryption.
export async function up(knex: Knex): Promise<void> {
  const hasActivatedAt = await knex.schema.hasColumn(TableName.KmsServerRootConfig, "activatedAt");
  const hasSupersededAt = await knex.schema.hasColumn(TableName.KmsServerRootConfig, "supersededAt");
  const hasLastResolvedAt = await knex.schema.hasColumn(TableName.KmsServerRootConfig, "lastResolvedAt");
  const hasKekLabel = await knex.schema.hasColumn(TableName.KmsServerRootConfig, "kekLabel");

  if (!hasActivatedAt || !hasSupersededAt || !hasLastResolvedAt || !hasKekLabel) {
    await knex.schema.alterTable(TableName.KmsServerRootConfig, (t) => {
      // NULL means a pending rotation nobody has booted with yet.
      if (!hasActivatedAt) t.timestamp("activatedAt");
      // Set on promotion, on the copy holding the key we just moved off.
      if (!hasSupersededAt) t.timestamp("supersededAt");
      // Stamped by each instance at boot on the row its key opened. Positive evidence that an instance
      // still holds that key; absence proves nothing, since an instance that never restarts never stamps.
      if (!hasLastResolvedAt) t.timestamp("lastResolvedAt");
      if (!hasKekLabel) t.string("kekLabel", 64);
    });
  }

  if (!hasActivatedAt) {
    // The pre-existing row is by definition active on an instance that has never rotated.
    await knex(TableName.KmsServerRootConfig).whereNull("activatedAt").update({ activatedAt: new Date() });
  }

  // The legacy env-var tier encrypts straight from the env var. Snapshotting those values under the
  // root key decouples it from the environment, so the env key can rotate without stranding it.
  if (!(await knex.schema.hasTable(TableName.KmsLegacyEncryptionKey))) {
    await knex.schema.createTable(TableName.KmsLegacyEncryptionKey, (t) => {
      // Fixed, so a concurrent seed is a PK conflict rather than a second row.
      t.uuid("id", { primaryKey: true });
      // Holds both the post-FIPS-relabel values (used for writes) and the pre-relabel ones, since the
      // relabel can drop a key that existing rows were written under.
      t.binary("encryptedKeySnapshot").notNullable();
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.KmsLegacyEncryptionKey);
  }

  // Survives the ciphertext it describes: once the GC deletes a superseded copy, this is the only
  // record tying a label to the window it was active.
  if (!(await knex.schema.hasTable(TableName.KmsKekHistory))) {
    await knex.schema.createTable(TableName.KmsKekHistory, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("kekLabel", 64).notNullable();
      t.timestamp("activatedAt").notNullable();
      t.timestamp("supersededAt");
      t.timestamp("retiredAt");
      t.timestamps(true, true, true);
      t.index(["activatedAt"]);
    });
    await createOnUpdateTrigger(knex, TableName.KmsKekHistory);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Only the sentinel is readable by pre-rotation code, so the other rows cannot survive.
  const columns = ["activatedAt", "supersededAt", "lastResolvedAt", "kekLabel"];
  const present: string[] = [];
  for (const column of columns) {
    // eslint-disable-next-line no-await-in-loop
    if (await knex.schema.hasColumn(TableName.KmsServerRootConfig, column)) present.push(column);
  }
  if (present.length) {
    await knex(TableName.KmsServerRootConfig).whereNot("id", "00000000-0000-0000-0000-000000000000").delete();
    await knex.schema.alterTable(TableName.KmsServerRootConfig, (t) => {
      present.forEach((column) => t.dropColumn(column));
    });
  }

  if (await knex.schema.hasTable(TableName.KmsKekHistory)) {
    await dropOnUpdateTrigger(knex, TableName.KmsKekHistory);
    await knex.schema.dropTable(TableName.KmsKekHistory);
  }

  // Last: without it the legacy tier falls back to process.env, correct only while that is still the
  // key the snapshot was seeded from.
  if (await knex.schema.hasTable(TableName.KmsLegacyEncryptionKey)) {
    await dropOnUpdateTrigger(knex, TableName.KmsLegacyEncryptionKey);
    await knex.schema.dropTable(TableName.KmsLegacyEncryptionKey);
  }
}
