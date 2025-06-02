import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.IdentityAccessToken, "accessTokenPeriod"))) {
    await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
      t.bigInteger("accessTokenPeriod").defaultTo(0).notNullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.IdentityUniversalAuth, "accessTokenPeriod"))) {
    await knex.schema.alterTable(TableName.IdentityUniversalAuth, (t) => {
      t.bigInteger("accessTokenPeriod").defaultTo(0).notNullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.IdentityAwsAuth, "accessTokenPeriod"))) {
    await knex.schema.alterTable(TableName.IdentityAwsAuth, (t) => {
      t.bigInteger("accessTokenPeriod").defaultTo(0).notNullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.IdentityOidcAuth, "accessTokenPeriod"))) {
    await knex.schema.alterTable(TableName.IdentityOidcAuth, (t) => {
      t.bigInteger("accessTokenPeriod").defaultTo(0).notNullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.IdentityAzureAuth, "accessTokenPeriod"))) {
    await knex.schema.alterTable(TableName.IdentityAzureAuth, (t) => {
      t.bigInteger("accessTokenPeriod").defaultTo(0).notNullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.IdentityGcpAuth, "accessTokenPeriod"))) {
    await knex.schema.alterTable(TableName.IdentityGcpAuth, (t) => {
      t.bigInteger("accessTokenPeriod").defaultTo(0).notNullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.IdentityJwtAuth, "accessTokenPeriod"))) {
    await knex.schema.alterTable(TableName.IdentityJwtAuth, (t) => {
      t.bigInteger("accessTokenPeriod").defaultTo(0).notNullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "accessTokenPeriod"))) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      t.bigInteger("accessTokenPeriod").defaultTo(0).notNullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.IdentityLdapAuth, "accessTokenPeriod"))) {
    await knex.schema.alterTable(TableName.IdentityLdapAuth, (t) => {
      t.bigInteger("accessTokenPeriod").defaultTo(0).notNullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.IdentityOciAuth, "accessTokenPeriod"))) {
    await knex.schema.alterTable(TableName.IdentityOciAuth, (t) => {
      t.bigInteger("accessTokenPeriod").defaultTo(0).notNullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.IdentityTokenAuth, "accessTokenPeriod"))) {
    await knex.schema.alterTable(TableName.IdentityTokenAuth, (t) => {
      t.bigInteger("accessTokenPeriod").defaultTo(0).notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.IdentityAccessToken, "accessTokenPeriod")) {
    await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
      t.dropColumn("accessTokenPeriod");
    });
  }

  if (await knex.schema.hasColumn(TableName.IdentityUniversalAuth, "accessTokenPeriod")) {
    await knex.schema.alterTable(TableName.IdentityUniversalAuth, (t) => {
      t.dropColumn("accessTokenPeriod");
    });
  }

  if (await knex.schema.hasColumn(TableName.IdentityAwsAuth, "accessTokenPeriod")) {
    await knex.schema.alterTable(TableName.IdentityAwsAuth, (t) => {
      t.dropColumn("accessTokenPeriod");
    });
  }

  if (await knex.schema.hasColumn(TableName.IdentityOidcAuth, "accessTokenPeriod")) {
    await knex.schema.alterTable(TableName.IdentityOidcAuth, (t) => {
      t.dropColumn("accessTokenPeriod");
    });
  }

  if (await knex.schema.hasColumn(TableName.IdentityAzureAuth, "accessTokenPeriod")) {
    await knex.schema.alterTable(TableName.IdentityAzureAuth, (t) => {
      t.dropColumn("accessTokenPeriod");
    });
  }

  if (await knex.schema.hasColumn(TableName.IdentityGcpAuth, "accessTokenPeriod")) {
    await knex.schema.alterTable(TableName.IdentityGcpAuth, (t) => {
      t.dropColumn("accessTokenPeriod");
    });
  }

  if (await knex.schema.hasColumn(TableName.IdentityJwtAuth, "accessTokenPeriod")) {
    await knex.schema.alterTable(TableName.IdentityJwtAuth, (t) => {
      t.dropColumn("accessTokenPeriod");
    });
  }

  if (await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "accessTokenPeriod")) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      t.dropColumn("accessTokenPeriod");
    });
  }

  if (await knex.schema.hasColumn(TableName.IdentityLdapAuth, "accessTokenPeriod")) {
    await knex.schema.alterTable(TableName.IdentityLdapAuth, (t) => {
      t.dropColumn("accessTokenPeriod");
    });
  }

  if (await knex.schema.hasColumn(TableName.IdentityOciAuth, "accessTokenPeriod")) {
    await knex.schema.alterTable(TableName.IdentityOciAuth, (t) => {
      t.dropColumn("accessTokenPeriod");
    });
  }

  if (await knex.schema.hasColumn(TableName.IdentityTokenAuth, "accessTokenPeriod")) {
    await knex.schema.alterTable(TableName.IdentityTokenAuth, (t) => {
      t.dropColumn("accessTokenPeriod");
    });
  }
}
