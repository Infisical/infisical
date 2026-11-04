import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Organization, "ssoMfaTrust"))) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.string("ssoMfaTrust", 20).notNullable().defaultTo("none");
    });
  }

  const hasSamlSignalAttribute = await knex.schema.hasColumn(TableName.SamlConfig, "mfaSignalAttribute");
  const hasSamlAuthnContexts = await knex.schema.hasColumn(TableName.SamlConfig, "mfaAuthnContexts");
  if (!hasSamlSignalAttribute || !hasSamlAuthnContexts) {
    await knex.schema.alterTable(TableName.SamlConfig, (t) => {
      if (!hasSamlSignalAttribute) t.string("mfaSignalAttribute", 512).nullable();
      if (!hasSamlAuthnContexts) t.specificType("mfaAuthnContexts", "text[]").nullable();
    });
  }

  const hasOidcClaimName = await knex.schema.hasColumn(TableName.OidcConfig, "mfaClaimName");
  const hasOidcAmrValues = await knex.schema.hasColumn(TableName.OidcConfig, "mfaAmrValues");
  if (!hasOidcClaimName || !hasOidcAmrValues) {
    await knex.schema.alterTable(TableName.OidcConfig, (t) => {
      if (!hasOidcClaimName) t.string("mfaClaimName", 128).notNullable().defaultTo("amr");
      if (!hasOidcAmrValues) t.specificType("mfaAmrValues", "text[]").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasOidcClaimName = await knex.schema.hasColumn(TableName.OidcConfig, "mfaClaimName");
  const hasOidcAmrValues = await knex.schema.hasColumn(TableName.OidcConfig, "mfaAmrValues");
  if (hasOidcClaimName || hasOidcAmrValues) {
    await knex.schema.alterTable(TableName.OidcConfig, (t) => {
      if (hasOidcClaimName) t.dropColumn("mfaClaimName");
      if (hasOidcAmrValues) t.dropColumn("mfaAmrValues");
    });
  }

  const hasSamlSignalAttribute = await knex.schema.hasColumn(TableName.SamlConfig, "mfaSignalAttribute");
  const hasSamlAuthnContexts = await knex.schema.hasColumn(TableName.SamlConfig, "mfaAuthnContexts");
  if (hasSamlSignalAttribute || hasSamlAuthnContexts) {
    await knex.schema.alterTable(TableName.SamlConfig, (t) => {
      if (hasSamlSignalAttribute) t.dropColumn("mfaSignalAttribute");
      if (hasSamlAuthnContexts) t.dropColumn("mfaAuthnContexts");
    });
  }

  if (await knex.schema.hasColumn(TableName.Organization, "ssoMfaTrust")) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropColumn("ssoMfaTrust");
    });
  }
}
