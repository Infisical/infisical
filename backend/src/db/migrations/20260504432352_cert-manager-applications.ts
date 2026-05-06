import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const ACCESS_SCOPE_PROJECT = "project";
const ACCESS_SCOPE_ORGANIZATION = "organization";
const PROJECT_TYPE_CERT_MANAGER = "cert-manager";
const PROJECT_VERSION_V3 = 3;
const PROJECT_MEMBERSHIP_ROLE_ADMIN = "admin";
const ORG_MEMBERSHIP_ROLE_ADMIN = "admin";
const ORG_MEMBERSHIP_ROLE_OWNER = "owner";
const PIT_VERSION_LIMIT_DEFAULT = 10;

const BACKFILL_CHUNK_SIZE = 8;

const backfillOrgCertManagerProject = async (knex: Knex, orgId: string) => {
  await knex.transaction(async (tx) => {
    const slug = slugify(`cert-manager-${alphaNumericNanoId(4)}`);

    const [{ id: projectId }] = (await tx(TableName.Project)
      .insert({
        name: "Certificate Manager",
        slug,
        type: PROJECT_TYPE_CERT_MANAGER,
        orgId,
        version: PROJECT_VERSION_V3,
        pitVersionLimit: PIT_VERSION_LIMIT_DEFAULT
      })
      .returning("id")) as Array<{ id: string }>;

    // Promote every existing org admin / owner to project admin so they can manage the new project.
    const orgAdminMemberships = (await tx(TableName.Membership)
      .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
      .where(`${TableName.Membership}.scope`, ACCESS_SCOPE_ORGANIZATION)
      .where(`${TableName.Membership}.scopeOrgId`, orgId)
      .whereNotNull(`${TableName.Membership}.actorUserId`)
      .whereIn(`${TableName.MembershipRole}.role`, [ORG_MEMBERSHIP_ROLE_ADMIN, ORG_MEMBERSHIP_ROLE_OWNER])
      .distinct(`${TableName.Membership}.actorUserId as actorUserId`)) as Array<{ actorUserId: string }>;

    if (orgAdminMemberships.length === 0) return;

    const insertedMemberships = (await tx(TableName.Membership)
      .insert(
        orgAdminMemberships.map((m) => ({
          scope: ACCESS_SCOPE_PROJECT,
          scopeOrgId: orgId,
          scopeProjectId: projectId,
          actorUserId: m.actorUserId,
          isActive: true
        }))
      )
      .returning("id")) as Array<{ id: string }>;

    await tx(TableName.MembershipRole).insert(
      insertedMemberships.map(({ id: membershipId }) => ({
        membershipId,
        role: PROJECT_MEMBERSHIP_ROLE_ADMIN
      }))
    );
  });
};

const backfillCertManagerProjectsForExistingOrgs = async (knex: Knex) => {
  const orgsMissingCertManager = (await knex(TableName.Organization)
    .leftJoin(TableName.Project, function joinProject() {
      this.on(`${TableName.Project}.orgId`, "=", `${TableName.Organization}.id`).andOn(
        `${TableName.Project}.type`,
        "=",
        knex.raw("?", [PROJECT_TYPE_CERT_MANAGER])
      );
    })
    .whereNull(`${TableName.Project}.id`)
    .select(`${TableName.Organization}.id`)) as Array<{ id: string }>;

  // Process orgs in chunks so the DB pool isn't saturated. Each chunk runs its
  // org transactions in parallel; chunks themselves run sequentially.
  for (let i = 0; i < orgsMissingCertManager.length; i += BACKFILL_CHUNK_SIZE) {
    const chunk = orgsMissingCertManager.slice(i, i + BACKFILL_CHUNK_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(chunk.map(({ id }) => backfillOrgCertManagerProject(knex, id)));
  }
};

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

  if (!(await knex.schema.hasColumn(TableName.CertificateRequests, "applicationId"))) {
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.uuid("applicationId").nullable();
      t.foreign("applicationId").references("id").inTable(TableName.PkiApplication).onDelete("SET NULL");
      t.index(["projectId", "applicationId"]);
    });
  }

  if (!(await knex.schema.hasColumn(TableName.CertificateInventoryView, "applicationId"))) {
    await knex.schema.alterTable(TableName.CertificateInventoryView, (t) => {
      t.uuid("applicationId").nullable();
      t.foreign("applicationId").references("id").inTable(TableName.PkiApplication).onDelete("CASCADE");
      t.index(["projectId", "applicationId"]);
    });

    await knex.raw(`DROP INDEX IF EXISTS "cert_inv_view_personal_unique"`);
    await knex.raw(`DROP INDEX IF EXISTS "cert_inv_view_shared_unique"`);

    await knex.raw(
      `CREATE UNIQUE INDEX "cert_inv_view_personal_unique" ON "${TableName.CertificateInventoryView}" ("projectId", COALESCE("applicationId"::text, ''), "name", "createdByUserId") WHERE "isShared" = false`
    );
    await knex.raw(
      `CREATE UNIQUE INDEX "cert_inv_view_shared_unique" ON "${TableName.CertificateInventoryView}" ("projectId", COALESCE("applicationId"::text, ''), "name") WHERE "isShared" = true`
    );
  }

  await backfillCertManagerProjectsForExistingOrgs(knex);
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.CertificateRequests, "applicationId")) {
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.dropForeign(["applicationId"]);
      t.dropIndex(["projectId", "applicationId"]);
      t.dropColumn("applicationId");
    });
  }

  if (await knex.schema.hasColumn(TableName.CertificateInventoryView, "applicationId")) {
    await knex.raw(`DROP INDEX IF EXISTS "cert_inv_view_personal_unique"`);
    await knex.raw(`DROP INDEX IF EXISTS "cert_inv_view_shared_unique"`);

    await knex.schema.alterTable(TableName.CertificateInventoryView, (t) => {
      t.dropForeign(["applicationId"]);
      t.dropIndex(["projectId", "applicationId"]);
      t.dropColumn("applicationId");
    });

    await knex.raw(
      `CREATE UNIQUE INDEX "cert_inv_view_personal_unique" ON "${TableName.CertificateInventoryView}" ("projectId", "name", "createdByUserId") WHERE "isShared" = false`
    );
    await knex.raw(
      `CREATE UNIQUE INDEX "cert_inv_view_shared_unique" ON "${TableName.CertificateInventoryView}" ("projectId", "name") WHERE "isShared" = true`
    );
  }

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
    // Resource-scoped memberships and their roles only exist for the feature
    // we're rolling back; clean them up before recreating the old check
    // constraint that disallows scope='resource'.
    await knex(TableName.MembershipRole)
      .whereIn(
        "membershipId",
        knex(TableName.Membership).where("scope", "resource").select("id")
      )
      .delete();
    await knex(TableName.Membership).where("scope", "resource").delete();

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
