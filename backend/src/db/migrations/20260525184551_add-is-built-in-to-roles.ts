import { packRules } from "@casl/ability/extra";
import { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";

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
  await knex.transaction(async (trx) => {
    const alreadySeededOrgRows = await trx(TableName.Role)
      .whereNotNull("orgId")
      .whereNull("projectId")
      .where({ slug: "member" })
      .select("orgId");
    const alreadySeededOrgIds = new Set(alreadySeededOrgRows.map((r) => String(r.orgId)));

    const orgs = await trx(TableName.Organization).select("id");
    const orgRolesToInsert = orgs
      .filter((o) => !alreadySeededOrgIds.has(String(o.id)))
      .flatMap(({ id: orgId }) => [
        {
          id: uuidv4(),
          orgId,
          projectId: null,
          name: "Member",
          slug: "member",
          description: "Members can read and create projects inside the organization.",
          permissions: packedOrgMember,
          isBuiltIn: true,
          createdAt: now,
          updatedAt: now
        },
        {
          id: uuidv4(),
          orgId,
          projectId: null,
          name: "No Access",
          slug: "no-access",
          description: "No access to organization resources.",
          permissions: packedOrgNoAccess,
          isBuiltIn: true,
          createdAt: now,
          updatedAt: now
        }
      ]);

    if (orgRolesToInsert.length > 0) {
      await knex.batchInsert(TableName.Role, orgRolesToInsert, BATCH_SIZE).transacting(trx);
    }

    const alreadySeededProjectRows = await trx(TableName.Role)
      .whereNull("orgId")
      .whereNotNull("projectId")
      .where({ slug: "member" })
      .select("projectId");
    const alreadySeededProjectIds = new Set(alreadySeededProjectRows.map((r) => String(r.projectId)));

    const projects = await trx(TableName.Project).select("id", "type");
    const projectRolesToInsert = projects
      .filter((p) => !alreadySeededProjectIds.has(String(p.id)))
      .flatMap(({ id: projectId, type }) => {
        const rows = [
          {
            id: uuidv4(),
            orgId: null,
            projectId,
            name: "Member",
            slug: "member",
            description: "Members can read and modify project resources.",
            permissions: packedProjectMember,
            isBuiltIn: true,
            createdAt: now,
            updatedAt: now
          },
          {
            id: uuidv4(),
            orgId: null,
            projectId,
            name: "Viewer",
            slug: "viewer",
            description: "Viewers can only read project resources.",
            permissions: packedProjectViewer,
            isBuiltIn: true,
            createdAt: now,
            updatedAt: now
          },
          {
            id: uuidv4(),
            orgId: null,
            projectId,
            name: "No Access",
            slug: "no-access",
            description: "No access to project resources.",
            permissions: packedProjectNoAccess,
            isBuiltIn: true,
            createdAt: now,
            updatedAt: now
          }
        ];

        if (type === ProjectType.SSH) {
          rows.push({
            id: uuidv4(),
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

        if (type === ProjectType.KMS) {
          rows.push({
            id: uuidv4(),
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
      await knex.batchInsert(TableName.Role, projectRolesToInsert, BATCH_SIZE).transacting(trx);
    }
  });

  // Back-fill customRoleId on membership_roles ────────────────────────────

  // org-scoped
  await knex.raw(`
    UPDATE "${TableName.MembershipRole}" mr
    SET "customRoleId" = r.id
    FROM "${TableName.Membership}" m
    JOIN "${TableName.Role}" r
      ON  r.slug = mr.role
      AND r."orgId"     = m."scopeOrgId"
      AND r."projectId" IS NULL
    WHERE mr."membershipId" = m.id
      AND m.scope = 'organization'
      AND mr.role <> 'admin'
      AND mr."customRoleId" IS NULL
  `);

  // project-scoped
  await knex.raw(`
    UPDATE "${TableName.MembershipRole}" mr
    SET "customRoleId" = r.id
    FROM "${TableName.Membership}" m
    JOIN "${TableName.Role}" r
      ON  r.slug = mr.role
      AND r."projectId" = m."scopeProjectId"
      AND r."orgId"     IS NULL
    WHERE mr."membershipId" = m.id
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
    SET "customRoleId" = NULL
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
    SET "customRoleId" = NULL
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
    WHERE r.id = o."defaultMembershipRole"
      AND r."orgId" = o.id
      AND r."projectId" IS NULL
      AND r.slug IN (${orgBuiltInSlugs.map(() => "?").join(", ")})
  `,
    orgBuiltInSlugs
  );

  await knex(TableName.Role).whereNotNull("orgId").whereNull("projectId").whereIn("slug", orgBuiltInSlugs).delete();
  await knex(TableName.Role).whereNull("orgId").whereNotNull("projectId").whereIn("slug", projectBuiltInSlugs).delete();

  const hasIsBuiltIn = await knex.schema.hasColumn(TableName.Role, "isBuiltIn");
  if (hasIsBuiltIn) {
    await knex.schema.alterTable(TableName.Role, (t) => {
      t.dropColumn("isBuiltIn");
    });
  }
}
