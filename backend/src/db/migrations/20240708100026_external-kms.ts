import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TableName } from "../schemas";

const createInternalKmsTableAndBackfillData = async (knex: Knex) => {
  const doesOldKmsKeyTableExist = await knex.schema.hasTable(TableName.KmsKey);
  const doesInternalKmsTableExist = await knex.schema.hasTable(TableName.InternalKms);

  // building the internal kms table by filling from old kms table
  if (doesOldKmsKeyTableExist && !doesInternalKmsTableExist) {
    await knex.schema.createTable(TableName.InternalKms, (tb) => {
      tb.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      tb.binary("encryptedKey").notNullable();
      tb.string("encryptionAlgorithm").notNullable();
      tb.integer("version").defaultTo(1).notNullable();
      tb.uuid("kmsKeyId").unique().notNullable();
      tb.foreign("kmsKeyId").references("id").inTable(TableName.KmsKey).onDelete("CASCADE");
    });

    // copy the old kms and backfill
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
  }
};

const renameKmsKeyVersionTableAsInternalKmsKeyVersion = async (knex: Knex) => {
  const doesOldKmsKeyVersionTableExist = await knex.schema.hasTable(TableName.KmsKeyVersion);
  const doesNewKmsKeyVersionTableExist = await knex.schema.hasTable(TableName.InternalKmsKeyVersion);

  if (doesOldKmsKeyVersionTableExist && !doesNewKmsKeyVersionTableExist) {
    // because we haven't started using versioning for kms thus no data exist
    await knex.schema.renameTable(TableName.KmsKeyVersion, TableName.InternalKmsKeyVersion);
    const hasKmsKeyIdColumn = await knex.schema.hasColumn(TableName.InternalKmsKeyVersion, "kmsKeyId");
    const hasInternalKmsIdColumn = await knex.schema.hasColumn(TableName.InternalKmsKeyVersion, "internalKmsId");

    await knex.schema.alterTable(TableName.InternalKmsKeyVersion, (tb) => {
      if (hasKmsKeyIdColumn) tb.dropColumn("kmsKeyId");
      if (!hasInternalKmsIdColumn) {
        tb.uuid("internalKmsId").notNullable();
        tb.foreign("internalKmsId").references("id").inTable(TableName.InternalKms).onDelete("CASCADE");
      }
    });
  }
};

const createExternalKmsKeyTable = async (knex: Knex) => {
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
};

const removeNonRequiredFieldsFromKmsKeyTableAndBackfillRequiredData = async (knex: Knex) => {
  const doesOldKmsKeyTableExist = await knex.schema.hasTable(TableName.KmsKey);

  // building the internal kms table by filling from old kms table
  if (doesOldKmsKeyTableExist) {
    const hasSlugColumn = await knex.schema.hasColumn(TableName.KmsKey, "slug");
    const hasEncryptedKeyColumn = await knex.schema.hasColumn(TableName.KmsKey, "encryptedKey");
    const hasEncryptionAlgorithmColumn = await knex.schema.hasColumn(TableName.KmsKey, "encryptionAlgorithm");
    const hasVersionColumn = await knex.schema.hasColumn(TableName.KmsKey, "version");
    const hasTimestamps = await knex.schema.hasColumn(TableName.KmsKey, "createdAt");
    const hasProjectId = await knex.schema.hasColumn(TableName.KmsKey, "projectId");
    const hasOrgId = await knex.schema.hasColumn(TableName.KmsKey, "orgId");

    await knex.schema.alterTable(TableName.KmsKey, (tb) => {
      if (!hasSlugColumn) tb.string("slug", 32);
      if (hasEncryptedKeyColumn) tb.dropColumn("encryptedKey");
      if (hasEncryptionAlgorithmColumn) tb.dropColumn("encryptionAlgorithm");
      if (hasVersionColumn) tb.dropColumn("version");
      if (!hasTimestamps) tb.timestamps(true, true, true);
    });

    // backfill all org id in kms key because its gonna be changed to non nullable
    if (hasProjectId && hasOrgId) {
      await knex(TableName.KmsKey)
        .whereNull("orgId")
        .update({
          // eslint-disable-next-line
          // @ts-ignore because generate schema happens after this
          orgId: knex(TableName.Project)
            .select("orgId")
            .where("id", knex.raw("??", [`${TableName.KmsKey}.projectId`]))
        });
    }

    // backfill slugs in kms
    const missingSlugs = await knex(TableName.KmsKey).whereNull("slug").select("id");
    if (missingSlugs.length) {
      await knex(TableName.KmsKey)
        // eslint-disable-next-line
        // @ts-ignore because generate schema happens after this
        .insert(missingSlugs.map(({ id }) => ({ id, slug: slugify(alphaNumericNanoId(8).toLowerCase()) })))
        .onConflict("id")
        .merge();
    }

    await knex.schema.alterTable(TableName.KmsKey, (tb) => {
      if (hasOrgId) tb.uuid("orgId").notNullable().alter();
      tb.string("slug", 32).notNullable().alter();
      if (hasProjectId) tb.dropColumn("projectId");
      if (hasOrgId) tb.unique(["orgId", "slug"]);
    });
  }
};

/*
 * The goal for this migration is split the existing kms key into three table
 * the kms-key table would be a container table that contains
 * the internal kms key table and external kms table
 */
export async function up(knex: Knex): Promise<void> {
  await createInternalKmsTableAndBackfillData(knex);
  await renameKmsKeyVersionTableAsInternalKmsKeyVersion(knex);
  await removeNonRequiredFieldsFromKmsKeyTableAndBackfillRequiredData(knex);
  await createExternalKmsKeyTable(knex);

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

const renameInternalKmsKeyVersionBackToKmsKeyVersion = async (knex: Knex) => {
  const doesInternalKmsKeyVersionTableExist = await knex.schema.hasTable(TableName.InternalKmsKeyVersion);
  const doesKmsKeyVersionTableExist = await knex.schema.hasTable(TableName.KmsKeyVersion);
  if (doesInternalKmsKeyVersionTableExist && !doesKmsKeyVersionTableExist) {
    // because we haven't started using versioning for kms thus no data exist
    await knex.schema.renameTable(TableName.InternalKmsKeyVersion, TableName.KmsKeyVersion);
    const hasInternalKmsIdColumn = await knex.schema.hasColumn(TableName.KmsKeyVersion, "internalKmsId");
    const hasKmsKeyIdColumn = await knex.schema.hasColumn(TableName.KmsKeyVersion, "kmsKeyId");

    await knex.schema.alterTable(TableName.KmsKeyVersion, (tb) => {
      if (hasInternalKmsIdColumn) tb.dropColumn("internalKmsId");
      if (!hasKmsKeyIdColumn) {
        tb.uuid("kmsKeyId").notNullable();
        tb.foreign("kmsKeyId").references("id").inTable(TableName.KmsKey).onDelete("CASCADE");
      }
    });
  }
};

const bringBackKmsKeyFields = async (knex: Knex) => {
  const doesOldKmsKeyTableExist = await knex.schema.hasTable(TableName.KmsKey);
  const doesInternalKmsTableExist = await knex.schema.hasTable(TableName.InternalKms);
  if (doesOldKmsKeyTableExist && doesInternalKmsTableExist) {
    const hasSlug = await knex.schema.hasColumn(TableName.KmsKey, "slug");
    const hasEncryptedKeyColumn = await knex.schema.hasColumn(TableName.KmsKey, "encryptedKey");
    const hasEncryptionAlgorithmColumn = await knex.schema.hasColumn(TableName.KmsKey, "encryptionAlgorithm");
    const hasVersionColumn = await knex.schema.hasColumn(TableName.KmsKey, "version");
    const hasNullableOrgId = await knex.schema.hasColumn(TableName.KmsKey, "orgId");
    const hasProjectIdColumn = await knex.schema.hasColumn(TableName.KmsKey, "projectId");

    await knex.schema.alterTable(TableName.KmsKey, (tb) => {
      if (!hasEncryptedKeyColumn) tb.binary("encryptedKey");
      if (!hasEncryptionAlgorithmColumn) tb.string("encryptionAlgorithm");
      if (!hasVersionColumn) tb.integer("version").defaultTo(1);
      if (hasNullableOrgId) tb.uuid("orgId").nullable().alter();
      if (!hasProjectIdColumn) {
        tb.string("projectId");
        tb.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      }
      if (hasSlug) tb.dropColumn("slug");
    });
  }
};

const backfillKmsKeyFromInternalKmsTable = async (knex: Knex) => {
  const doesOldKmsKeyTableExist = await knex.schema.hasTable(TableName.KmsKey);
  const doesInternalKmsTableExist = await knex.schema.hasTable(TableName.InternalKms);
  if (doesInternalKmsTableExist && doesOldKmsKeyTableExist) {
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
  }
};

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

  await renameInternalKmsKeyVersionBackToKmsKeyVersion(knex);
  await bringBackKmsKeyFields(knex);
  await backfillKmsKeyFromInternalKmsTable(knex);

  const doesOldKmsKeyTableExist = await knex.schema.hasTable(TableName.KmsKey);
  if (doesOldKmsKeyTableExist) {
    await knex.schema.alterTable(TableName.KmsKey, (tb) => {
      tb.binary("encryptedKey").notNullable().alter();
      tb.string("encryptionAlgorithm").notNullable().alter();
    });
  }

  const doesInternalKmsTableExist = await knex.schema.hasTable(TableName.InternalKms);
  if (doesInternalKmsTableExist) await knex.schema.dropTable(TableName.InternalKms);

  const doesExternalKmsServiceExist = await knex.schema.hasTable(TableName.ExternalKms);
  if (doesExternalKmsServiceExist) await knex.schema.dropTable(TableName.ExternalKms);
}
