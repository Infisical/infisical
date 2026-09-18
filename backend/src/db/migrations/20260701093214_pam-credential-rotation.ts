import { Knex } from "knex";

import { TableName } from "../schemas";

const NEXT_ROTATION_AT_INDEX = "pam_accounts_next_rotation_at_index";

export async function up(knex: Knex): Promise<void> {
  const hasRotationAccountId = await knex.schema.hasColumn(TableName.PamAccount, "rotationAccountId");
  const hasNextRotationAt = await knex.schema.hasColumn(TableName.PamAccount, "nextRotationAt");
  const hasEncryptedPendingCredentials = await knex.schema.hasColumn(
    TableName.PamAccount,
    "encryptedPendingCredentials"
  );

  await knex.schema.alterTable(TableName.PamAccount, (t) => {
    if (!hasRotationAccountId) {
      // RESTRICT so an account referenced as a rotation account cannot be deleted out from under its dependents.
      t.uuid("rotationAccountId").nullable();
      t.foreign("rotationAccountId").references("id").inTable(TableName.PamAccount).onDelete("RESTRICT");
      t.index(["rotationAccountId"]);
    }
    if (!hasNextRotationAt) {
      t.datetime("nextRotationAt").nullable();
      // Partial index: the finder only scans due, scheduled rows.
      t.index(["nextRotationAt"], NEXT_ROTATION_AT_INDEX, { predicate: knex.whereNotNull("nextRotationAt") });
    }
    if (!hasEncryptedPendingCredentials) {
      // Staged new credential held until the change is confirmed on the target, then promoted.
      t.binary("encryptedPendingCredentials").nullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasRotationAccountId = await knex.schema.hasColumn(TableName.PamAccount, "rotationAccountId");
  const hasNextRotationAt = await knex.schema.hasColumn(TableName.PamAccount, "nextRotationAt");
  const hasEncryptedPendingCredentials = await knex.schema.hasColumn(
    TableName.PamAccount,
    "encryptedPendingCredentials"
  );

  await knex.schema.alterTable(TableName.PamAccount, (t) => {
    if (hasNextRotationAt) {
      t.dropIndex(["nextRotationAt"], NEXT_ROTATION_AT_INDEX);
      t.dropColumn("nextRotationAt");
    }
    if (hasRotationAccountId) {
      t.dropColumn("rotationAccountId");
    }
    if (hasEncryptedPendingCredentials) {
      t.dropColumn("encryptedPendingCredentials");
    }
  });
}
