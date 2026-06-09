import { packRules } from "@casl/ability/extra";
import { Knex } from "knex";

import {
  cryptographicOperatorPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  projectViewerPermission,
  sshHostBootstrapPermissions
} from "@app/ee/services/permission/default-roles";
import { orgMemberPermissions, orgNoAccessPermissions } from "@app/ee/services/permission/org-permission";

import { ProjectType, TableName } from "../schemas";

const BATCH_SIZE = 500;

// Cast packRules once — its overloaded signatures don't unify on union inputs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const packPermissions = (rules: unknown) => JSON.stringify((packRules as (r: any) => unknown[])(rules));

const packedOrgMember = packPermissions(orgMemberPermissions);
const packedOrgNoAccess = packPermissions(orgNoAccessPermissions);
const packedProjectMember = packPermissions(projectMemberPermissions);
const packedProjectViewer = packPermissions(projectViewerPermission);
const packedProjectNoAccess = packPermissions(projectNoAccessPermissions);
const packedSshBootstrap = packPermissions(sshHostBootstrapPermissions);
const packedCryptoOperator = packPermissions(cryptographicOperatorPermissions);

export async function up(knex: Knex): Promise<void> {
  const now = new Date();

  // ── Add isBuiltIn column ────
  const hasIsBuiltIn = await knex.schema.hasColumn(TableName.Role, "isBuiltIn");
  if (!hasIsBuiltIn) {
    await knex.schema.alterTable(TableName.Role, (t) => {
      t.boolean("isBuiltIn").notNullable().defaultTo(false);
    });
  }

  // ── Seed built-in roles ────
  // Process in chunks to keep memory bounded on large deployments (100K+ projects/orgs).
  const CHUNK_SIZE = 2000;

  const orgBuiltInSlugs = ["member", "no-access"];
  const orgCount = (await knex(TableName.Organization).count("id as cnt").first()) as { cnt: string } | undefined;
  const totalOrgs = Number(orgCount?.cnt ?? 0);

  for (let offset = 0; offset < totalOrgs; offset += CHUNK_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    const orgChunk = await knex(TableName.Organization).select("id").offset(offset).limit(CHUNK_SIZE);
    const orgIds = orgChunk.map((o) => o.id);

    // eslint-disable-next-line no-await-in-loop
    const alreadySeededOrgRows = await knex(TableName.Role)
      .whereIn("orgId", orgIds)
      .whereNull("projectId")
      .whereIn("slug", orgBuiltInSlugs)
      .select("orgId", "slug");
    const alreadySeededOrgSet = new Set(alreadySeededOrgRows.map((r) => `${String(r.orgId)}:${r.slug}`));

    const orgRolesToInsert = orgChunk.flatMap(({ id: orgId }) => {
      const rows = [];
      if (!alreadySeededOrgSet.has(`${orgId}:member`)) {
        rows.push({
          orgId,
          projectId: null,
          name: "Member",
          slug: "member",
          description: "Members can read and create projects inside the organization.",
          permissions: packedOrgMember,
          isBuiltIn: true,
          createdAt: now,
          updatedAt: now
        });
      }
      if (!alreadySeededOrgSet.has(`${orgId}:no-access`)) {
        rows.push({
          orgId,
          projectId: null,
          name: "No Access",
          slug: "no-access",
          description: "No access to organization resources.",
          permissions: packedOrgNoAccess,
          isBuiltIn: true,
          createdAt: now,
          updatedAt: now
        });
      }
      return rows;
    });

    if (orgRolesToInsert.length > 0) {
      // eslint-disable-next-line no-await-in-loop
      await knex.batchInsert(TableName.Role, orgRolesToInsert, BATCH_SIZE);
    }
  }

  const projectBuiltInSlugsToCheck = [
    "member",
    "viewer",
    "no-access",
    "ssh-host-bootstrapper",
    "cryptographic-operator"
  ];
  const projectCount = (await knex(TableName.Project).count("id as cnt").first()) as { cnt: string } | undefined;
  const totalProjects = Number(projectCount?.cnt ?? 0);

  for (let offset = 0; offset < totalProjects; offset += CHUNK_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    const projectChunk = await knex(TableName.Project).select("id", "type").offset(offset).limit(CHUNK_SIZE);
    const projectIds = projectChunk.map((p) => p.id);

    // eslint-disable-next-line no-await-in-loop
    const alreadySeededProjectRows = await knex(TableName.Role)
      .whereIn("projectId", projectIds)
      .whereNull("orgId")
      .whereIn("slug", projectBuiltInSlugsToCheck)
      .select("projectId", "slug");
    const alreadySeededProjectSet = new Set(alreadySeededProjectRows.map((r) => `${String(r.projectId)}:${r.slug}`));

    const projectRolesToInsert = projectChunk.flatMap(({ id: projectId, type }) => {
      const rows = [];

      if (!alreadySeededProjectSet.has(`${projectId}:member`)) {
        rows.push({
          orgId: null,
          projectId,
          name: "Member",
          slug: "member",
          description: "Members can read and modify project resources.",
          permissions: packedProjectMember,
          isBuiltIn: true,
          createdAt: now,
          updatedAt: now
        });
      }

      if (!alreadySeededProjectSet.has(`${projectId}:viewer`)) {
        rows.push({
          orgId: null,
          projectId,
          name: "Viewer",
          slug: "viewer",
          description: "Viewers can only read project resources.",
          permissions: packedProjectViewer,
          isBuiltIn: true,
          createdAt: now,
          updatedAt: now
        });
      }

      if (!alreadySeededProjectSet.has(`${projectId}:no-access`)) {
        rows.push({
          orgId: null,
          projectId,
          name: "No Access",
          slug: "no-access",
          description: "No access to project resources.",
          permissions: packedProjectNoAccess,
          isBuiltIn: true,
          createdAt: now,
          updatedAt: now
        });
      }

      if (type === ProjectType.SSH && !alreadySeededProjectSet.has(`${projectId}:ssh-host-bootstrapper`)) {
        rows.push({
          orgId: null,
          projectId,
          name: "SSH Host Bootstrapper",
          slug: "ssh-host-bootstrapper",
          description: "Allows bootstrapping SSH hosts.",
          permissions: packedSshBootstrap,
          isBuiltIn: true,
          createdAt: now,
          updatedAt: now
        });
      }

      if (type === ProjectType.KMS && !alreadySeededProjectSet.has(`${projectId}:cryptographic-operator`)) {
        rows.push({
          orgId: null,
          projectId,
          name: "Cryptographic Operator",
          slug: "cryptographic-operator",
          description: "Can perform cryptographic operations.",
          permissions: packedCryptoOperator,
          isBuiltIn: true,
          createdAt: now,
          updatedAt: now
        });
      }

      return rows;
    });

    if (projectRolesToInsert.length > 0) {
      // eslint-disable-next-line no-await-in-loop
      await knex.batchInsert(TableName.Role, projectRolesToInsert, BATCH_SIZE);
    }
  }

  // ── Back-fill customRoleId on membership_roles ────
  // Normalize `role` to 'custom' for every backfilled (non-admin) role so migrated
  // assignments match the going-forward convention: any DB-backed role (built-in or custom)
  // is stored as role='custom' + customRoleId, and only the in-code Admin keeps its slug.
  // The `r.slug = mr.role` join is evaluated against the pre-update row, so matching works.

  // org-scoped
  await knex.raw(`
    UPDATE "${TableName.MembershipRole}" mr
    SET "customRoleId" = r.id,
        role = 'custom'
    FROM "${TableName.Membership}" m,
         "${TableName.Role}" r
    WHERE mr."membershipId" = m.id
      AND r.slug = mr.role
      AND r."orgId" = m."scopeOrgId"
      AND r."projectId" IS NULL
      AND m.scope = 'organization'
      AND mr.role <> 'admin'
      AND mr."customRoleId" IS NULL
  `);

  // project-scoped
  await knex.raw(`
    UPDATE "${TableName.MembershipRole}" mr
    SET "customRoleId" = r.id,
        role = 'custom'
    FROM "${TableName.Membership}" m,
         "${TableName.Role}" r
    WHERE mr."membershipId" = m.id
      AND r.slug = mr.role
      AND r."projectId" = m."scopeProjectId"
      AND r."orgId" IS NULL
      AND m.scope IN ('project', 'resource')
      AND mr.role <> 'admin'
      AND mr."customRoleId" IS NULL
  `);

  // Convert org.defaultMembershipRole from slug to UUID so the field is always a role ID.
  await knex.raw(`
    UPDATE "${TableName.Organization}" o
    SET "defaultMembershipRole" = r.id
    FROM "${TableName.Role}" r
    WHERE r.slug = o."defaultMembershipRole"
      AND r."orgId" = o.id
      AND r."projectId" IS NULL
      AND o."defaultMembershipRole" <> 'admin'
  `);
}

export async function down(knex: Knex): Promise<void> {
  const orgBuiltInSlugs = ["member", "no-access"];
  const projectBuiltInSlugs = ["member", "viewer", "no-access", "ssh-host-bootstrapper", "cryptographic-operator"];

  await knex.raw(
    `
    UPDATE "${TableName.MembershipRole}" mr
    SET "customRoleId" = NULL,
        role = r.slug
    FROM "${TableName.Role}" r
    WHERE mr."customRoleId" = r.id
      AND r.slug IN (${orgBuiltInSlugs.map(() => "?").join(", ")})
      AND r."orgId" IS NOT NULL
      AND r."projectId" IS NULL
      AND mr.role <> 'admin'
  `,
    orgBuiltInSlugs
  );

  await knex.raw(
    `
    UPDATE "${TableName.MembershipRole}" mr
    SET "customRoleId" = NULL,
        role = r.slug
    FROM "${TableName.Role}" r
    WHERE mr."customRoleId" = r.id
      AND r.slug IN (${projectBuiltInSlugs.map(() => "?").join(", ")})
      AND r."projectId" IS NOT NULL
      AND r."orgId" IS NULL
      AND mr.role <> 'admin'
  `,
    projectBuiltInSlugs
  );

  // Restore defaultMembershipRole from UUID back to slug.
  await knex.raw(
    `
    UPDATE "${TableName.Organization}" o
    SET "defaultMembershipRole" = r.slug
    FROM "${TableName.Role}" r
    WHERE r.id::text = o."defaultMembershipRole"
      AND r."orgId" = o.id
      AND r."projectId" IS NULL
      AND r.slug IN (${orgBuiltInSlugs.map(() => "?").join(", ")})
  `,
    orgBuiltInSlugs
  );

  // Clean up FK references to built-in roles before deleting them.
  await knex(TableName.ExternalGroupOrgRoleMapping)
    .whereIn(
      "roleId",
      knex(TableName.Role).select("id").whereNotNull("orgId").whereNull("projectId").whereIn("slug", orgBuiltInSlugs)
    )
    .delete();

  await knex(TableName.Role).whereNotNull("orgId").whereNull("projectId").whereIn("slug", orgBuiltInSlugs).delete();
  await knex(TableName.Role).whereNull("orgId").whereNotNull("projectId").whereIn("slug", projectBuiltInSlugs).delete();

  const hasIsBuiltIn = await knex.schema.hasColumn(TableName.Role, "isBuiltIn");
  if (hasIsBuiltIn) {
    await knex.schema.alterTable(TableName.Role, (t) => {
      t.dropColumn("isBuiltIn");
    });
  }
}
