import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";
import { dropConstraintIfExists } from "./utils/dropConstraintIfExists";

const SECRET_CHANGE_FK = "secret_approval_requests_secrets_v2_secretchangeid_foreign";
const REQUEST_XOR_CHANGE_CHECK = "secret_approval_requests_secrets_v2_request_xor_change_check";
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretChangeRequests))) {
    await knex.schema.createTable(TableName.SecretChangeRequests, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("approvalRequestId").notNullable().unique();
      t.foreign("approvalRequestId").references("id").inTable(TableName.ApprovalRequests).onDelete("CASCADE");

      t.uuid("folderId").notNullable().index();
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");

      t.uuid("statusChangedByUserId").nullable().index();
      t.foreign("statusChangedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");

      t.string("slug").notNullable();
      t.boolean("hasMerged").defaultTo(false).notNullable();
      t.jsonb("conflicts").nullable();
      t.text("commitMessage").nullable();
      t.text("bypassReason").nullable();

      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.SecretChangeRequests);
  }

  // secret_approval_requests_secrets_v2 is large: the FK and check are added NOT VALID so this
  // transaction only holds its exclusive lock briefly. The next migration validates them outside a
  // transaction, where validation does not block writes.
  await knex.raw(`SET LOCAL lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);

  if (!(await knex.schema.hasColumn(TableName.SecretApprovalRequestSecretV2, "secretChangeId"))) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestSecretV2, (t) => {
      t.uuid("secretChangeId").nullable();
    });

    // knex's .alter() emits ALTER COLUMN TYPE ... USING, which rewrites the whole table.
    await knex.raw(`ALTER TABLE ?? ALTER COLUMN "requestId" DROP NOT NULL`, [TableName.SecretApprovalRequestSecretV2]);

    await knex.raw(
      `ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY ("secretChangeId") REFERENCES ?? ("id") ON DELETE CASCADE NOT VALID`,
      [TableName.SecretApprovalRequestSecretV2, SECRET_CHANGE_FK, TableName.SecretChangeRequests]
    );
    await knex.raw(
      `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (num_nonnulls("requestId", "secretChangeId") = 1) NOT VALID`,
      [TableName.SecretApprovalRequestSecretV2, REQUEST_XOR_CHANGE_CHECK]
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretApprovalRequestSecretV2, "secretChangeId")) {
    // Rows staged for a secret change request have no legacy requestId and cannot survive NOT NULL.
    await knex(TableName.SecretApprovalRequestSecretV2).whereNull("requestId").delete();

    await dropConstraintIfExists(TableName.SecretApprovalRequestSecretV2, REQUEST_XOR_CHANGE_CHECK, knex);
    await dropConstraintIfExists(TableName.SecretApprovalRequestSecretV2, SECRET_CHANGE_FK, knex);

    await knex.schema.alterTable(TableName.SecretApprovalRequestSecretV2, (t) => {
      t.dropColumn("secretChangeId");
    });
    await knex.raw(`ALTER TABLE ?? ALTER COLUMN "requestId" SET NOT NULL`, [TableName.SecretApprovalRequestSecretV2]);
  }

  await dropOnUpdateTrigger(knex, TableName.SecretChangeRequests);
  await knex.schema.dropTableIfExists(TableName.SecretChangeRequests);
}
