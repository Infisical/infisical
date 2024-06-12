import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const doesPasswordFieldExist = await knex.schema.hasColumn(TableName.UserEncryptionKey, "hashedPassword");
  const doesPrivateKeyFieldExist = await knex.schema.hasColumn(
    TableName.UserEncryptionKey,
    "serverEncryptedPrivateKey"
  );
  const doesPrivateKeyIVFieldExist = await knex.schema.hasColumn(
    TableName.UserEncryptionKey,
    "serverEncryptedPrivateKeyIV"
  );
  const doesPrivateKeyTagFieldExist = await knex.schema.hasColumn(
    TableName.UserEncryptionKey,
    "serverEncryptedPrivateKeyTag"
  );
  const doesPrivateKeyEncodingFieldExist = await knex.schema.hasColumn(
    TableName.UserEncryptionKey,
    "serverEncryptedPrivateKeyEncoding"
  );
  if (await knex.schema.hasTable(TableName.UserEncryptionKey)) {
    await knex.schema.alterTable(TableName.UserEncryptionKey, (t) => {
      if (!doesPasswordFieldExist) t.string("hashedPassword");
      if (!doesPrivateKeyFieldExist) t.text("serverEncryptedPrivateKey");
      if (!doesPrivateKeyIVFieldExist) t.text("serverEncryptedPrivateKeyIV");
      if (!doesPrivateKeyTagFieldExist) t.text("serverEncryptedPrivateKeyTag");
      if (!doesPrivateKeyEncodingFieldExist) t.text("serverEncryptedPrivateKeyEncoding");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesPasswordFieldExist = await knex.schema.hasColumn(TableName.UserEncryptionKey, "hashedPassword");
  const doesPrivateKeyFieldExist = await knex.schema.hasColumn(
    TableName.UserEncryptionKey,
    "serverEncryptedPrivateKey"
  );
  const doesPrivateKeyIVFieldExist = await knex.schema.hasColumn(
    TableName.UserEncryptionKey,
    "serverEncryptedPrivateKeyIV"
  );
  const doesPrivateKeyTagFieldExist = await knex.schema.hasColumn(
    TableName.UserEncryptionKey,
    "serverEncryptedPrivateKeyTag"
  );
  const doesPrivateKeyEncodingFieldExist = await knex.schema.hasColumn(
    TableName.UserEncryptionKey,
    "serverEncryptedPrivateKeyEncoding"
  );
  if (await knex.schema.hasTable(TableName.UserEncryptionKey)) {
    await knex.schema.alterTable(TableName.UserEncryptionKey, (t) => {
      if (doesPasswordFieldExist) t.dropColumn("hashedPassword");
      if (doesPrivateKeyFieldExist) t.dropColumn("serverEncryptedPrivateKey");
      if (doesPrivateKeyIVFieldExist) t.dropColumn("serverEncryptedPrivateKeyIV");
      if (doesPrivateKeyTagFieldExist) t.dropColumn("serverEncryptedPrivateKeyTag");
      if (doesPrivateKeyEncodingFieldExist) t.dropColumn("serverEncryptedPrivateKeyEncoding");
    });
  }
}
