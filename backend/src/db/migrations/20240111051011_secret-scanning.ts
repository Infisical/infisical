import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.GitAppInstallSession))) {
    await knex.schema.createTable(TableName.GitAppInstallSession, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("sessionId").notNullable().unique();
      t.uuid("userId");
      // one to one relationship
      t.uuid("orgId").notNullable().unique();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.GitAppInstallSession);

  if (!(await knex.schema.hasTable(TableName.GitAppOrg))) {
    await knex.schema.createTable(TableName.GitAppOrg, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("installationId").notNullable().unique();
      t.uuid("userId").notNullable();
      // one to one relationship
      t.uuid("orgId").notNullable().unique();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.GitAppOrg);

  if (!(await knex.schema.hasTable(TableName.SecretScanningGitRisk))) {
    await knex.schema.createTable(TableName.SecretScanningGitRisk, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("description");
      t.string("startLine");
      t.string("endLine");
      t.string("startColumn");
      t.string("endColumn");
      t.string("file");
      t.string("symlinkFile");
      t.string("commit");
      t.string("entropy");
      t.string("author");
      t.string("email");
      t.string("date");
      t.text("message");
      t.specificType("tags", "text[]");
      t.string("ruleID");
      t.string("fingerprint").unique();
      t.string("fingerPrintWithoutCommitId");
      t.boolean("isFalsePositive").defaultTo(false);
      t.boolean("isResolved").defaultTo(false);
      t.string("riskOwner");
      t.string("installationId").notNullable();
      t.string("repositoryId");
      t.string("repositoryLink");
      t.string("repositoryFullName");
      t.string("pusherName");
      t.string("pusherEmail");
      t.string("status");
      // one to one relationship
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.SecretScanningGitRisk);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretScanningGitRisk);
  await knex.schema.dropTableIfExists(TableName.GitAppOrg);
  await knex.schema.dropTableIfExists(TableName.GitAppInstallSession);
  await dropOnUpdateTrigger(knex, TableName.SecretScanningGitRisk);
  await dropOnUpdateTrigger(knex, TableName.GitAppOrg);
  await dropOnUpdateTrigger(knex, TableName.GitAppInstallSession);
}
