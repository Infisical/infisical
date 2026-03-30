import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasUserTable = await knex.schema.hasTable(TableName.Users);
  const hasHashedPasswordColumn = await knex.schema.hasColumn(TableName.Users, "hashedPassword");
  const hasIsGitHubVerifiedColumn = await knex.schema.hasColumn(TableName.Users, "isGitHubVerified");
  const hasIsGitlabVerifiedColumn = await knex.schema.hasColumn(TableName.Users, "isGitLabVerified");
  if (hasUserTable) {
    await knex.schema.alterTable(TableName.Users, (table) => {
      if (!hasHashedPasswordColumn) {
        table.string("hashedPassword").nullable();
      }
      if (!hasIsGitHubVerifiedColumn) {
        table.boolean("isGitHubVerified").nullable();
      }
      if (!hasIsGitlabVerifiedColumn) {
        table.boolean("isGitLabVerified").nullable();
      }
    });
  }

  if (!(await knex.schema.hasTable(TableName.EmailDomains))) {
    await knex.schema.createTable(TableName.EmailDomains, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.string("domain", 255).notNullable().unique();
      t.string("parentDomain", 255);

      // Verification details
      t.string("verificationMethod", 50).notNullable().defaultTo("dns-txt");
      t.string("verificationCode", 255).notNullable();
      t.string("verificationRecordName", 255).notNullable();

      // Status tracking
      t.string("status", 20).notNullable().defaultTo("pending");
      t.timestamp("verifiedAt").nullable();

      // Expiry
      t.timestamp("codeExpiresAt").notNullable();

      t.timestamps(true, true, true);

      // Indexes
      t.index("parentDomain");
      t.index("orgId");

      // Check constraint
      t.check(
        `:statusColumn: IN ('pending', 'verified', 'expired')`,
        { statusColumn: "status" },
        "chk_email_domain_status"
      );
    });

    await createOnUpdateTrigger(knex, TableName.EmailDomains);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.EmailDomains)) {
    await dropOnUpdateTrigger(knex, TableName.EmailDomains);
    await knex.schema.dropTable(TableName.EmailDomains);
  }

  const hasUserTable = await knex.schema.hasTable(TableName.Users);
  const hasHashedPasswordColumn = await knex.schema.hasColumn(TableName.Users, "hashedPassword");
  const hasIsGitHubVerifiedColumn = await knex.schema.hasColumn(TableName.Users, "isGitHubVerified");
  const hasIsGitlabVerifiedColumn = await knex.schema.hasColumn(TableName.Users, "isGitLabVerified");
  if (hasUserTable) {
    await knex.schema.alterTable(TableName.Users, (table) => {
      if (hasHashedPasswordColumn) {
        table.dropColumn("hashedPassword");
      }
      if (hasIsGitHubVerifiedColumn) {
        table.dropColumn("isGitHubVerified");
      }
      if (hasIsGitlabVerifiedColumn) {
        table.dropColumn("isGitLabVerified");
      }
    });
  }
}
