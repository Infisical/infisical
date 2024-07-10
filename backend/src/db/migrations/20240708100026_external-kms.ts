import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // rename old kms key table to internal kms table
  // the kms key table would be a container to hold external and internal respectively
  const doesOldKmsKeyTableExist = await knex.schema.hasTable(TableName.KmsKey);
  const doesOldKmsKeyVersionTableExist = await knex.schema.hasTable(TableName.KmsKeyVersion);
  const doesInternalKmsTableExist = await knex.schema.hasTable(TableName.InternalKms);

  if (doesOldKmsKeyTableExist && !doesInternalKmsTableExist) {
    await knex.schema.createTable(TableName.InternalKms, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.binary("encryptedKey").notNullable();
      tb.string("encryptionAlgorithm").notNullable();
      tb.integer("version").defaultTo(1).notNullable();
      tb.uuid("kmsKeyId").unique().notNullable();
      tb.foreign("kmsKeyId").references("id").inTable(TableName.KmsKey).onDelete("CASCADE");
    });
    // copy the old kms and build the data
    const oldKmsKey = await knex(TableName.KmsKey).select("version", "encryptedKey", "encryptionAlgorithm", "id");
    if (oldKmsKey.length) {
      await knex(TableName.InternalKms).insert(
        oldKmsKey.map((el) => ({
          encryptionAlgorithm: el.encryptionAlgorithm,
          encryptedKey: el.encryptedKey,
          kmsKeyId: el.id,
          version: el.version
        }))
      );
    }

    if (doesOldKmsKeyVersionTableExist) {
      // because we haven't started using versioning for kms thus no data exist
      await knex.schema.renameTable(TableName.KmsKeyVersion, TableName.InternalKmsKeyVersion);
      await knex.schema.alterTable(TableName.InternalKmsKeyVersion, (tb) => {
        tb.dropColumn("kmsKeyId");
        tb.uuid("internalKmsId").notNullable();
        tb.foreign("internalKmsId").references("id").inTable(TableName.InternalKms).onDelete("CASCADE");
      });
    }

    await knex.schema.alterTable(TableName.KmsKey, (tb) => {
      tb.string("slug", 32);
      tb.dropColumn("encryptedKey");
      tb.dropColumn("encryptionAlgorithm");
      tb.dropColumn("version");
    });
    // backfill all org id in kms key
    await knex(TableName.KmsKey)
      .whereNull("orgId")
      .update({
        // eslint-disable-next-line
        // @ts-ignore because generate schema happens after this
        orgId: knex(TableName.Project)
          .select("orgId")
          .where("id", knex.raw("??", [`${TableName.KmsKey}.projectId`]))
      });
    // backfill slugs in kms
    const missingSlugs = await knex(TableName.KmsKey).whereNull("slug").select("id");
    if (missingSlugs.length) {
      await knex(TableName.KmsKey)
        // eslint-disable-next-line
        // @ts-ignore because generate schema happens after this
        .insert(missingSlugs.map(({ id }) => ({ id, slug: slugify(alphaNumericNanoId(32)) })))
        .onConflict("id")
        .merge();
    }

    await knex.schema.alterTable(TableName.KmsKey, (tb) => {
      tb.uuid("orgId").notNullable().alter();
      tb.string("slug", 32).notNullable().alter();
      tb.dropColumn("projectId");
    });
  }

  const doesExternalKmsServiceExist = await knex.schema.hasTable(TableName.ExternalKms);
  if (!doesExternalKmsServiceExist) {
    await knex.schema.createTable(TableName.ExternalKms, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.string("provider").notNullable();
      tb.binary("encryptedProviderInputs").notNullable();
      tb.string("status");
      tb.string("statusDetails");
      tb.uuid("kmsKeyId").unique().notNullable();
      tb.foreign("kmsKeyId").references("id").inTable(TableName.KmsKey).onDelete("CASCADE");
    });
  }

  const doesOrgKmsKeyExist = await knex.schema.hasColumn(TableName.Organization, "kmsDefaultKeyId");
  if (!doesOrgKmsKeyExist) {
    await knex.schema.alterTable(TableName.Organization, (tb) => {
      tb.uuid("kmsDefaultKeyId").nullable();
      tb.foreign("kmsDefaultKeyId").references("id").inTable(TableName.KmsKey);
    });
  }

  const doesProjectKmsSecretManagerKeyExist = await knex.schema.hasColumn(TableName.Project, "kmsSecretManagerKeyId");
  if (!doesProjectKmsSecretManagerKeyExist) {
    await knex.schema.alterTable(TableName.Project, (tb) => {
      tb.uuid("kmsSecretManagerKeyId").nullable();
      tb.foreign("kmsSecretManagerKeyId").references("id").inTable(TableName.KmsKey);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesOrgKmsKeyExist = await knex.schema.hasColumn(TableName.Organization, "kmsDefaultKeyId");
  if (doesOrgKmsKeyExist) {
    await knex.schema.alterTable(TableName.Organization, (tb) => {
      tb.dropColumn("kmsDefaultKeyId");
    });
  }

  const doesProjectKmsSecretManagerKeyExist = await knex.schema.hasColumn(TableName.Project, "kmsSecretManagerKeyId");
  if (doesProjectKmsSecretManagerKeyExist) {
    await knex.schema.alterTable(TableName.Project, (tb) => {
      tb.dropColumn("kmsSecretManagerKeyId");
    });
  }

  const doesInternalKmsKeyVersionTableExist = await knex.schema.hasTable(TableName.InternalKmsKeyVersion);
  const doesInternalKmsTableExist = await knex.schema.hasTable(TableName.InternalKms);
  if (doesInternalKmsKeyVersionTableExist) {
    // because we haven't started using versioning for kms thus no data exist
    await knex.schema.renameTable(TableName.InternalKmsKeyVersion, TableName.KmsKeyVersion);
    await knex.schema.alterTable(TableName.KmsKeyVersion, (tb) => {
      tb.dropColumn("internalKmsId");
      tb.uuid("kmsKeyId").notNullable();
      tb.foreign("kmsKeyId").references("id").inTable(TableName.KmsKey).onDelete("CASCADE");
    });
  }

  const doesOldKmsKeyTableExist = await knex.schema.hasTable(TableName.KmsKey);
  const doesKmsSlugExist = await knex.schema.hasColumn(TableName.KmsKey, "slug");
  if (doesInternalKmsTableExist && doesOldKmsKeyTableExist) {
    // converting kms key to old one
    // backfill so not setting it as not nullable
    await knex.schema.alterTable(TableName.KmsKey, (tb) => {
      tb.binary("encryptedKey");
      tb.string("encryptionAlgorithm");
      tb.integer("version").defaultTo(1);
      tb.string("projectId");
      tb.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      if (doesKmsSlugExist) {
        tb.dropColumn("slug");
      }
    });
    // backfill kms key with internal kms data
    await knex(TableName.KmsKey).update({
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      encryptedKey: knex(TableName.InternalKms)
        .select("encryptedKey")
        .where("kmsKeyId", knex.raw("??", [`${TableName.KmsKey}.id`])),
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      encryptionAlgorithm: knex(TableName.InternalKms)
        .select("encryptionAlgorithm")
        .where("kmsKeyId", knex.raw("??", [`${TableName.KmsKey}.id`])),
      // eslint-disable-next-line
      // @ts-ignore because generate schema happens after this
      projectId: knex(TableName.Project)
        .select("id")
        .where("kmsCertificateKeyId", knex.raw("??", [`${TableName.KmsKey}.id`]))
    });
    await knex.schema.alterTable(TableName.KmsKey, (tb) => {
      tb.binary("encryptedKey").notNullable().alter();
      tb.string("encryptionAlgorithm").notNullable().alter();
    });
    await knex.schema.alterTable(TableName.InternalKms, (tb) => {
      tb.dropForeign("kmsKeyId");
    });
    await knex.schema.dropTable(TableName.InternalKms);
  }

  const doesExternalKmsServiceExist = await knex.schema.hasTable(TableName.ExternalKms);
  if (doesExternalKmsServiceExist) {
    await knex.schema.alterTable(TableName.ExternalKms, (tb) => {
      tb.dropForeign("kmsKeyId");
    });
    await knex.schema.dropTable(TableName.ExternalKms);
  }
}
