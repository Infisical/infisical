import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasEncryptedGithubAppConnectionClientIdColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedGitHubAppConnectionClientId"
  );
  const hasEncryptedGithubAppConnectionClientSecretColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedGitHubAppConnectionClientSecret"
  );

  const hasEncryptedGithubAppConnectionSlugColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedGitHubAppConnectionSlug"
  );

  const hasEncryptedGithubAppConnectionAppIdColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedGitHubAppConnectionId"
  );

  const hasEncryptedGithubAppConnectionAppPrivateKeyColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedGitHubAppConnectionPrivateKey"
  );

  await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
    if (!hasEncryptedGithubAppConnectionClientIdColumn) {
      t.binary("encryptedGitHubAppConnectionClientId").nullable();
    }
    if (!hasEncryptedGithubAppConnectionClientSecretColumn) {
      t.binary("encryptedGitHubAppConnectionClientSecret").nullable();
    }
    if (!hasEncryptedGithubAppConnectionSlugColumn) {
      t.binary("encryptedGitHubAppConnectionSlug").nullable();
    }
    if (!hasEncryptedGithubAppConnectionAppIdColumn) {
      t.binary("encryptedGitHubAppConnectionId").nullable();
    }
    if (!hasEncryptedGithubAppConnectionAppPrivateKeyColumn) {
      t.binary("encryptedGitHubAppConnectionPrivateKey").nullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasEncryptedGithubAppConnectionClientIdColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedGitHubAppConnectionClientId"
  );
  const hasEncryptedGithubAppConnectionClientSecretColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedGitHubAppConnectionClientSecret"
  );

  const hasEncryptedGithubAppConnectionSlugColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedGitHubAppConnectionSlug"
  );

  const hasEncryptedGithubAppConnectionAppIdColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedGitHubAppConnectionId"
  );

  const hasEncryptedGithubAppConnectionAppPrivateKeyColumn = await knex.schema.hasColumn(
    TableName.SuperAdmin,
    "encryptedGitHubAppConnectionPrivateKey"
  );

  await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
    if (hasEncryptedGithubAppConnectionClientIdColumn) {
      t.dropColumn("encryptedGitHubAppConnectionClientId");
    }
    if (hasEncryptedGithubAppConnectionClientSecretColumn) {
      t.dropColumn("encryptedGitHubAppConnectionClientSecret");
    }
    if (hasEncryptedGithubAppConnectionSlugColumn) {
      t.dropColumn("encryptedGitHubAppConnectionSlug");
    }
    if (hasEncryptedGithubAppConnectionAppIdColumn) {
      t.dropColumn("encryptedGitHubAppConnectionId");
    }
    if (hasEncryptedGithubAppConnectionAppPrivateKeyColumn) {
      t.dropColumn("encryptedGitHubAppConnectionPrivateKey");
    }
  });
}
