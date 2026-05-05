import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Organization, "defaultCertManagerProjectId"))) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.string("defaultCertManagerProjectId", 36);
      t.foreign("defaultCertManagerProjectId").references("id").inTable(TableName.Project).onDelete("SET NULL");
    });
  }

  if (!(await knex.schema.hasTable(TableName.PkiApplication))) {
    await knex.schema.createTable(TableName.PkiApplication, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");
      t.string("name", 64).notNullable();
      t.string("description", 256);
      t.timestamps(true, true, true);
      t.unique(["name", "projectId"]);
    });
    await createOnUpdateTrigger(knex, TableName.PkiApplication);
  }

  if (!(await knex.schema.hasTable(TableName.PkiApplicationProfile))) {
    await knex.schema.createTable(TableName.PkiApplicationProfile, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("applicationId").notNullable();
      t.foreign("applicationId").references("id").inTable(TableName.PkiApplication).onDelete("CASCADE");
      t.uuid("profileId").notNullable();
      t.foreign("profileId").references("id").inTable(TableName.PkiCertificateProfile).onDelete("CASCADE");
      t.uuid("estConfigId");
      t.foreign("estConfigId").references("id").inTable(TableName.PkiEstEnrollmentConfig).onDelete("SET NULL");
      t.uuid("apiConfigId");
      t.foreign("apiConfigId").references("id").inTable(TableName.PkiApiEnrollmentConfig).onDelete("SET NULL");
      t.uuid("acmeConfigId");
      t.foreign("acmeConfigId").references("id").inTable(TableName.PkiAcmeEnrollmentConfig).onDelete("SET NULL");
      t.uuid("scepConfigId");
      t.foreign("scepConfigId").references("id").inTable(TableName.PkiScepEnrollmentConfig).onDelete("SET NULL");
      t.timestamps(true, true, true);
      t.unique(["applicationId", "profileId"]);
      t.index("profileId");
    });
    await createOnUpdateTrigger(knex, TableName.PkiApplicationProfile);
  }

  if (!(await knex.schema.hasColumn(TableName.Membership, "scopeResourceType"))) {
    await knex.schema.alterTable(TableName.Membership, (t) => {
      t.string("scopeResourceType", 32);
      t.string("scopeResourceId", 36);
    });

    await knex.schema.alterTable(TableName.Membership, (t) => {
      t.dropChecks("scope_matches_id");
      t.check(
        `("scope" = 'project' AND "scopeProjectId" IS NOT NULL) OR ("scope" = 'organization') OR ("scope" = 'resource' AND "scopeProjectId" IS NOT NULL AND "scopeResourceType" IS NOT NULL AND "scopeResourceId" IS NOT NULL)`,
        {},
        "scope_matches_id"
      );
    });

    await knex.schema.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS membership_unique_user_resource
      ON ${TableName.Membership} ("scopeProjectId", "scopeResourceType", "scopeResourceId", "actorUserId")
      WHERE scope = 'resource' AND "actorUserId" IS NOT NULL;
    `);
    await knex.schema.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS membership_unique_identity_resource
      ON ${TableName.Membership} ("scopeProjectId", "scopeResourceType", "scopeResourceId", "actorIdentityId")
      WHERE scope = 'resource' AND "actorIdentityId" IS NOT NULL;
    `);
    await knex.schema.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS membership_unique_group_resource
      ON ${TableName.Membership} ("scopeProjectId", "scopeResourceType", "scopeResourceId", "actorGroupId")
      WHERE scope = 'resource' AND "actorGroupId" IS NOT NULL;
    `);
    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS membership_project_resource_idx
      ON ${TableName.Membership} ("scopeProjectId", "scopeResourceType", "scopeResourceId")
      WHERE scope = 'resource';
    `);
  }

  if (!(await knex.schema.hasColumn(TableName.PkiAlertsV2, "applicationId"))) {
    await knex.schema.alterTable(TableName.PkiAlertsV2, (t) => {
      t.uuid("applicationId");
      t.foreign("applicationId").references("id").inTable(TableName.PkiApplication).onDelete("CASCADE");
      t.index(["projectId", "applicationId"]);
    });
  }

  if (!(await knex.schema.hasColumn(TableName.PkiSync, "applicationId"))) {
    await knex.schema.alterTable(TableName.PkiSync, (t) => {
      t.uuid("applicationId");
      t.foreign("applicationId").references("id").inTable(TableName.PkiApplication).onDelete("CASCADE");
      t.index(["projectId", "applicationId"]);
    });
  }

  if (!(await knex.schema.hasColumn(TableName.ApprovalPolicies, "applicationId"))) {
    await knex.schema.alterTable(TableName.ApprovalPolicies, (t) => {
      t.uuid("applicationId").nullable();
      t.foreign("applicationId").references("id").inTable(TableName.PkiApplication).onDelete("CASCADE");
      t.index("applicationId");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.ApprovalRequests, "applicationId"))) {
    await knex.schema.alterTable(TableName.ApprovalRequests, (t) => {
      t.uuid("applicationId").nullable();
      t.foreign("applicationId").references("id").inTable(TableName.PkiApplication).onDelete("CASCADE");
      t.index("applicationId");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.Certificate, "applicationId"))) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.uuid("applicationId").nullable();
      t.foreign("applicationId").references("id").inTable(TableName.PkiApplication).onDelete("SET NULL");
      t.index(["projectId", "applicationId"]);
    });
  }

  if (!(await knex.schema.hasColumn(TableName.PkiAcmeAccount, "applicationProfileId"))) {
    await knex.schema.alterTable(TableName.PkiAcmeAccount, (t) => {
      t.uuid("applicationProfileId").nullable();
      t.foreign("applicationProfileId").references("id").inTable(TableName.PkiApplicationProfile).onDelete("CASCADE");
      t.index("applicationProfileId");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.PkiScepTransaction, "applicationId"))) {
    await knex.schema.alterTable(TableName.PkiScepTransaction, (t) => {
      t.uuid("applicationId").nullable();
      t.foreign("applicationId").references("id").inTable(TableName.PkiApplication).onDelete("CASCADE");
      t.index("applicationId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PkiScepTransaction, "applicationId")) {
    await knex.schema.alterTable(TableName.PkiScepTransaction, (t) => {
      t.dropForeign(["applicationId"]);
      t.dropColumn("applicationId");
    });
  }

  if (await knex.schema.hasColumn(TableName.PkiAcmeAccount, "applicationProfileId")) {
    await knex.schema.alterTable(TableName.PkiAcmeAccount, (t) => {
      t.dropForeign(["applicationProfileId"]);
      t.dropColumn("applicationProfileId");
    });
  }

  if (await knex.schema.hasColumn(TableName.Certificate, "applicationId")) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.dropForeign(["applicationId"]);
      t.dropColumn("applicationId");
    });
  }

  if (await knex.schema.hasColumn(TableName.ApprovalRequests, "applicationId")) {
    await knex.schema.alterTable(TableName.ApprovalRequests, (t) => {
      t.dropForeign(["applicationId"]);
      t.dropColumn("applicationId");
    });
  }

  if (await knex.schema.hasColumn(TableName.ApprovalPolicies, "applicationId")) {
    await knex.schema.alterTable(TableName.ApprovalPolicies, (t) => {
      t.dropForeign(["applicationId"]);
      t.dropColumn("applicationId");
    });
  }

  if (await knex.schema.hasColumn(TableName.PkiSync, "applicationId")) {
    await knex.schema.alterTable(TableName.PkiSync, (t) => {
      t.dropForeign(["applicationId"]);
      t.dropColumn("applicationId");
    });
  }

  if (await knex.schema.hasColumn(TableName.PkiAlertsV2, "applicationId")) {
    await knex.schema.alterTable(TableName.PkiAlertsV2, (t) => {
      t.dropForeign(["applicationId"]);
      t.dropColumn("applicationId");
    });
  }

  await knex.schema.raw("DROP INDEX IF EXISTS membership_project_resource_idx;");
  await knex.schema.raw("DROP INDEX IF EXISTS membership_unique_user_resource;");
  await knex.schema.raw("DROP INDEX IF EXISTS membership_unique_identity_resource;");
  await knex.schema.raw("DROP INDEX IF EXISTS membership_unique_group_resource;");

  if (await knex.schema.hasColumn(TableName.Membership, "scopeResourceType")) {
    await knex.schema.alterTable(TableName.Membership, (t) => {
      t.dropChecks("scope_matches_id");
      t.check(
        `("scope" = 'project' AND "scopeProjectId" IS NOT NULL) OR ("scope" = 'organization')`,
        {},
        "scope_matches_id"
      );
    });
    await knex.schema.alterTable(TableName.Membership, (t) => {
      t.dropColumn("scopeResourceType");
      t.dropColumn("scopeResourceId");
    });
  }

  await dropOnUpdateTrigger(knex, TableName.PkiApplicationProfile);
  await knex.schema.dropTableIfExists(TableName.PkiApplicationProfile);

  await dropOnUpdateTrigger(knex, TableName.PkiApplication);
  await knex.schema.dropTableIfExists(TableName.PkiApplication);

  if (await knex.schema.hasColumn(TableName.Organization, "defaultCertManagerProjectId")) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropForeign(["defaultCertManagerProjectId"]);
      t.dropColumn("defaultCertManagerProjectId");
    });
  }
}
