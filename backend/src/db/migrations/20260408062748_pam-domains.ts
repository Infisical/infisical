/* eslint-disable no-await-in-loop, @typescript-eslint/no-explicit-any */
import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  // \Create pam_domains table
  if (!(await knex.schema.hasTable(TableName.PamDomain))) {
    await knex.schema.createTable(TableName.PamDomain, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.string("name").notNullable();
      t.index("name");

      t.string("domainType").notNullable();
      t.index("domainType");

      t.uuid("gatewayId").nullable();
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2);
      t.index("gatewayId");

      t.binary("encryptedConnectionDetails").notNullable();
      t.string("discoveryFingerprint").nullable();

      t.unique(["projectId", "name"]);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PamDomain);
  }

  // Add domainId to pam_resources
  if (await knex.schema.hasTable(TableName.PamResource)) {
    const hasDomainId = await knex.schema.hasColumn(TableName.PamResource, "domainId");
    if (!hasDomainId) {
      await knex.schema.alterTable(TableName.PamResource, (t) => {
        t.uuid("domainId").nullable();
        t.foreign("domainId").references("id").inTable(TableName.PamDomain).onDelete("SET NULL");
        t.index("domainId");
      });
    }
  }

  // Add domainId to pam_accounts (exactly one of resourceId/domainId must be set)
  if (await knex.schema.hasTable(TableName.PamAccount)) {
    const hasDomainId = await knex.schema.hasColumn(TableName.PamAccount, "domainId");
    if (!hasDomainId) {
      await knex.schema.alterTable(TableName.PamAccount, (t) => {
        t.uuid("domainId").nullable();
        t.foreign("domainId").references("id").inTable(TableName.PamDomain).onDelete("CASCADE");
        t.index("domainId");
      });

      await knex.schema.alterTable(TableName.PamAccount, (t) => {
        t.uuid("resourceId").nullable().alter();
      });

      await knex.raw(`
        ALTER TABLE ${TableName.PamAccount}
        ADD CONSTRAINT chk_pam_account_parent
        CHECK (
          (("resourceId" IS NOT NULL AND "domainId" IS NULL) OR ("resourceId" IS NULL AND "domainId" IS NOT NULL))
        )
      `);
    }
  }

  // Add pamDomainId to resource_metadata
  if (await knex.schema.hasTable(TableName.ResourceMetadata)) {
    const hasPamDomainId = await knex.schema.hasColumn(TableName.ResourceMetadata, "pamDomainId");
    if (!hasPamDomainId) {
      await knex.schema.alterTable(TableName.ResourceMetadata, (t) => {
        t.uuid("pamDomainId").nullable();
        t.foreign("pamDomainId").references("id").inTable(TableName.PamDomain).onDelete("CASCADE");
      });
    }
  }

  // Migrate existing AD resources to domains (preserving IDs for referential integrity)
  const adResources = await knex(TableName.PamResource).where("resourceType", "active-directory").select("*");

  for (const adResource of adResources) {
    await knex(TableName.PamDomain).insert({
      id: adResource.id,
      projectId: adResource.projectId,
      name: adResource.name,
      domainType: "active-directory",
      gatewayId: adResource.gatewayId,
      encryptedConnectionDetails: adResource.encryptedConnectionDetails,
      discoveryFingerprint: adResource.discoveryFingerprint
    } as any);

    await knex(TableName.PamAccount)
      .where("resourceId", adResource.id)
      .update({
        domainId: adResource.id,
        resourceId: null
      } as any);

    await knex(TableName.PamResource)
      .where("adServerResourceId", adResource.id)
      .update({
        domainId: adResource.id,
        adServerResourceId: null
      } as any);

    await knex(TableName.PamResourceRotationRule).where("resourceId", adResource.id).delete();
    await knex(TableName.PamDiscoverySourceResource).where("resourceId", adResource.id).delete();

    await knex(TableName.ResourceMetadata)
      .where("pamResourceId", adResource.id)
      .update({
        pamDomainId: adResource.id,
        pamResourceId: null
      } as any);

    await knex(TableName.PamResource).where("id", adResource.id).delete();
  }

  // Drop adServerResourceId column from pam_resources
  if (await knex.schema.hasTable(TableName.PamResource)) {
    const hasAdServerResourceId = await knex.schema.hasColumn(TableName.PamResource, "adServerResourceId");
    if (hasAdServerResourceId) {
      await knex.schema.alterTable(TableName.PamResource, (t) => {
        t.dropColumn("adServerResourceId");
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PamResource)) {
    const hasAdServerResourceId = await knex.schema.hasColumn(TableName.PamResource, "adServerResourceId");
    if (!hasAdServerResourceId) {
      await knex.schema.alterTable(TableName.PamResource, (t) => {
        t.uuid("adServerResourceId").nullable();
        t.foreign("adServerResourceId").references("id").inTable(TableName.PamResource).onDelete("SET NULL");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.PamDomain)) {
    const domains = await knex(TableName.PamDomain).where("domainType", "active-directory").select("*");

    for (const domain of domains) {
      await knex(TableName.PamResource).insert({
        id: domain.id,
        projectId: domain.projectId,
        name: domain.name,
        resourceType: "active-directory",
        gatewayId: domain.gatewayId,
        encryptedConnectionDetails: domain.encryptedConnectionDetails,
        discoveryFingerprint: domain.discoveryFingerprint
      } as any);

      await knex(TableName.PamAccount)
        .where("domainId", domain.id)
        .update({
          resourceId: domain.id,
          domainId: null
        } as any);

      await knex(TableName.PamResource)
        .where("domainId", domain.id)
        .update({
          adServerResourceId: domain.id,
          domainId: null
        } as any);

      await knex(TableName.ResourceMetadata)
        .where("pamDomainId", domain.id)
        .update({
          pamResourceId: domain.id,
          pamDomainId: null
        } as any);

      await knex(TableName.PamDomain).where("id", domain.id).delete();
    }
  }

  await knex.raw(`ALTER TABLE ${TableName.PamAccount} DROP CONSTRAINT IF EXISTS chk_pam_account_parent`);

  if (await knex.schema.hasTable(TableName.PamAccount)) {
    const hasDomainId = await knex.schema.hasColumn(TableName.PamAccount, "domainId");
    if (hasDomainId) {
      await knex.schema.alterTable(TableName.PamAccount, (t) => {
        t.uuid("resourceId").notNullable().alter();
        t.dropColumn("domainId");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.ResourceMetadata)) {
    const hasPamDomainId = await knex.schema.hasColumn(TableName.ResourceMetadata, "pamDomainId");
    if (hasPamDomainId) {
      await knex.schema.alterTable(TableName.ResourceMetadata, (t) => {
        t.dropColumn("pamDomainId");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.PamResource)) {
    const hasDomainId = await knex.schema.hasColumn(TableName.PamResource, "domainId");
    if (hasDomainId) {
      await knex.schema.alterTable(TableName.PamResource, (t) => {
        t.dropColumn("domainId");
      });
    }
  }

  await dropOnUpdateTrigger(knex, TableName.PamDomain);
  await knex.schema.dropTableIfExists(TableName.PamDomain);
}
