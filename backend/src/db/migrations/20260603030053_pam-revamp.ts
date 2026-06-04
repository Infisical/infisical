/* eslint-disable no-await-in-loop */
import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { PamFolderRole, PamProductRole } from "@app/ee/services/pam/pam-enums";
import { DEFAULT_ACCOUNT_TEMPLATES } from "@app/ee/services/pam-instance/pam-project-bootstrap";
import { inMemoryKeyStore } from "@app/keystore/memory";
import { initLogger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import {
  AccessScope,
  OrgMembershipRole,
  ProjectMembershipRole,
  ProjectType,
  RESOURCE_SCOPE,
  ResourceType,
  TableName
} from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";
import { getMigrationEnvConfig, getMigrationHsmConfig } from "./utils/env-config";
import { getMigrationEncryptionServices, getMigrationHsmService } from "./utils/services";

const BACKFILL_CHUNK_SIZE = 8;

const seedDefaultTemplates = async (knex: Knex, orgId: string) => {
  for (const template of DEFAULT_ACCOUNT_TEMPLATES) {
    await knex(TableName.PamAccountTemplate)
      .insert({
        orgId,
        name: template.name,
        type: template.type,
        accessPolicy: JSON.stringify(template.accessPolicy),
        settings: JSON.stringify(template.settings)
      })
      .onConflict(["orgId", "name"])
      .ignore();
  }
};

const createPamProjectForOrg = async (knex: Knex, orgId: string) => {
  const slug = slugify(`pam-${alphaNumericNanoId(4)}`);

  const [{ id: projectId }] = (await knex(TableName.Project)
    .insert({
      name: "Access Management",
      slug,
      type: ProjectType.PAM,
      orgId,
      version: 3,
      pitVersionLimit: 10
    })
    .returning("id")) as Array<{ id: string }>;

  await knex(TableName.Organization).where("id", orgId).update({ defaultPamProjectId: projectId });
  await seedDefaultTemplates(knex, orgId);

  return projectId;
};

const backfillPamProjectsForAllOrgs = async (knex: Knex) => {
  const allOrgs = (await knex(TableName.Organization).whereNull("defaultPamProjectId").select("id")) as Array<{
    id: string;
  }>;

  for (let i = 0; i < allOrgs.length; i += BACKFILL_CHUNK_SIZE) {
    const chunk = allOrgs.slice(i, i + BACKFILL_CHUNK_SIZE);
    await Promise.all(chunk.map(({ id }) => createPamProjectForOrg(knex, id)));
  }
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.Organization, (t) => {
    t.string("defaultPamProjectId", 36).nullable();
    t.foreign("defaultPamProjectId").references("id").inTable(TableName.Project).onDelete("SET NULL");
  });

  await knex.schema.createTable(TableName.PamAccountTemplate, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

    t.uuid("orgId").notNullable();
    t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    t.index("orgId");

    t.string("name").notNullable();
    t.text("description").nullable();

    t.string("type").notNullable();
    t.index("type");

    t.jsonb("accessPolicy").nullable();
    t.jsonb("settings").nullable();

    t.uuid("gatewayId").nullable();
    t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL");

    t.uuid("gatewayPoolId").nullable();
    t.foreign("gatewayPoolId").references("id").inTable(TableName.GatewayPool).onDelete("SET NULL");

    t.uuid("recordingConnectionId").nullable();
    t.foreign("recordingConnectionId").references("id").inTable(TableName.AppConnection).onDelete("SET NULL");

    t.unique(["orgId", "name"]);

    t.timestamps(true, true, true);
  });

  await createOnUpdateTrigger(knex, TableName.PamAccountTemplate);

  await backfillPamProjectsForAllOrgs(knex);

  // Drop old folders table and recreate with new schema
  await knex.raw(`UPDATE ${TableName.PamAccount} SET "folderId" = NULL WHERE "folderId" IS NOT NULL`);
  await knex.schema.alterTable(TableName.PamAccount, (t) => {
    t.dropForeign(["folderId"]);
  });
  await dropOnUpdateTrigger(knex, TableName.PamFolder);
  await knex.schema.dropTable(TableName.PamFolder);

  await knex.schema.createTable(TableName.PamFolder, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

    t.uuid("orgId").notNullable();
    t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    t.index("orgId");

    t.string("name").notNullable();
    t.index("name");

    t.text("description").nullable();

    t.unique(["orgId", "name"]);

    t.timestamps(true, true, true);
  });

  await createOnUpdateTrigger(knex, TableName.PamFolder);

  await knex.schema.alterTable(TableName.PamAccount, (t) => {
    t.foreign("folderId").references("id").inTable(TableName.PamFolder).onDelete("CASCADE");
  });

  // Add new columns to accounts
  await knex.raw(`ALTER TABLE ${TableName.PamAccount} DROP CONSTRAINT IF EXISTS chk_pam_account_parent`);

  await knex.schema.alterTable(TableName.PamAccount, (t) => {
    t.uuid("orgId").nullable();
    t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    t.index("orgId");

    t.uuid("templateId").nullable();
    t.foreign("templateId").references("id").inTable(TableName.PamAccountTemplate).onDelete("RESTRICT");
    t.index("templateId");

    t.binary("encryptedConnectionDetails").nullable();
    t.binary("encryptedInternalMetadata").nullable();

    t.uuid("gatewayId").nullable();
    t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL");

    t.uuid("gatewayPoolId").nullable();
    t.foreign("gatewayPoolId").references("id").inTable(TableName.GatewayPool).onDelete("SET NULL");

    t.uuid("recordingConnectionId").nullable();
    t.foreign("recordingConnectionId").references("id").inTable(TableName.AppConnection).onDelete("SET NULL");
  });

  await knex.raw(`
    UPDATE ${TableName.PamAccount} a
    SET "orgId" = p."orgId"
    FROM ${TableName.Project} p
    WHERE a."projectId" = p.id
  `);

  // Migrate data from old projects
  initLogger();
  const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });

  const getProjectCipher = async (projectId: string) =>
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId }, knex);

  const orgsWithPam = await knex(TableName.Project).where("type", ProjectType.PAM).distinct("orgId").select("orgId");

  for (const { orgId } of orgsWithPam) {
    const org = await knex(TableName.Organization).where("id", orgId).first("defaultPamProjectId");
    const newProjectId = org!.defaultPamProjectId as string;
    const newProjectCipher = await getProjectCipher(newProjectId);

    const reEncrypt = (oldCipher: Awaited<ReturnType<typeof getProjectCipher>>, blob?: Buffer | null) => {
      if (!blob) return undefined;
      const plainText = oldCipher.decryptor({ cipherTextBlob: blob });
      return newProjectCipher.encryptor({ plainText }).cipherTextBlob;
    };

    const templates = await knex(TableName.PamAccountTemplate).where({ orgId }).select("id", "type");
    const templateMap: Record<string, string> = {};
    for (const t of templates) {
      templateMap[t.type] = t.id;
    }

    const oldPamProjects = await knex(TableName.Project)
      .where({ orgId, type: ProjectType.PAM })
      .whereNot("id", newProjectId)
      .select("id", "name");

    const projectToFolder: Record<string, string> = {};

    for (const project of oldPamProjects) {
      const folderName = slugify(project.name) || project.id.slice(0, 8);
      const [folder] = await knex(TableName.PamFolder).insert({ orgId, name: folderName }).returning("id");
      projectToFolder[project.id] = folder.id;
    }

    for (const [projectId, folderId] of Object.entries(projectToFolder)) {
      const oldProjectCipher = await getProjectCipher(projectId);

      const resourceAccounts = await knex(TableName.PamAccount)
        .join(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
        .where(`${TableName.PamResource}.projectId`, projectId)
        .select(
          `${TableName.PamAccount}.id as accountId`,
          `${TableName.PamAccount}.encryptedCredentials`,
          `${TableName.PamResource}.resourceType`,
          `${TableName.PamResource}.encryptedConnectionDetails`,
          `${TableName.PamResource}.encryptedResourceMetadata`,
          `${TableName.PamResource}.gatewayId`,
          `${TableName.PamResource}.gatewayPoolId`
        );

      for (const account of resourceAccounts) {
        const templateId = templateMap[account.resourceType];
        if (templateId) {
          await knex(TableName.PamAccount)
            .where("id", account.accountId)
            .update({
              folderId,
              templateId,
              encryptedCredentials: reEncrypt(oldProjectCipher, account.encryptedCredentials),
              encryptedConnectionDetails: reEncrypt(oldProjectCipher, account.encryptedConnectionDetails),
              encryptedInternalMetadata: reEncrypt(oldProjectCipher, account.encryptedResourceMetadata),
              gatewayId: account.gatewayId,
              gatewayPoolId: account.gatewayPoolId
            });
        }
      }

      const domainAccounts = await knex(TableName.PamAccount)
        .join(TableName.PamDomain, `${TableName.PamAccount}.domainId`, `${TableName.PamDomain}.id`)
        .where(`${TableName.PamDomain}.projectId`, projectId)
        .select(
          `${TableName.PamAccount}.id as accountId`,
          `${TableName.PamAccount}.encryptedCredentials`,
          `${TableName.PamDomain}.domainType`,
          `${TableName.PamDomain}.encryptedConnectionDetails`,
          `${TableName.PamDomain}.gatewayId`,
          `${TableName.PamDomain}.gatewayPoolId`
        );

      for (const account of domainAccounts) {
        const templateId = templateMap[account.domainType];
        if (templateId) {
          await knex(TableName.PamAccount)
            .where("id", account.accountId)
            .update({
              folderId,
              templateId,
              encryptedCredentials: reEncrypt(oldProjectCipher, account.encryptedCredentials),
              encryptedConnectionDetails: reEncrypt(oldProjectCipher, account.encryptedConnectionDetails),
              gatewayId: account.gatewayId,
              gatewayPoolId: account.gatewayPoolId
            });
        }
      }
    }

    // Migrate permissions
    const orgAdmins = new Set(
      (
        await knex(TableName.Membership)
          .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
          .where(`${TableName.Membership}.scope`, AccessScope.Organization)
          .where(`${TableName.Membership}.scopeOrgId`, orgId)
          .where(`${TableName.Membership}.isActive`, true)
          .where(`${TableName.MembershipRole}.role`, OrgMembershipRole.Admin)
          .whereNotNull(`${TableName.Membership}.actorUserId`)
          .select(`${TableName.Membership}.actorUserId as userId`)
      ).map((r: { userId: string }) => r.userId)
    );

    const pamProjectAdmins = new Set<string>();
    const allPamUsers = new Map<string, string[]>();

    for (const project of oldPamProjects) {
      const projectMembers = await knex(TableName.Membership)
        .where({ scope: AccessScope.Project, scopeProjectId: project.id, isActive: true })
        .whereNotNull("actorUserId")
        .select("id", "actorUserId as userId");

      for (const member of projectMembers) {
        if (!allPamUsers.has(member.userId)) {
          allPamUsers.set(member.userId, []);
        }
        allPamUsers.get(member.userId)!.push(project.id);

        const roles = await knex(TableName.MembershipRole).where("membershipId", member.id).select("role");

        if (roles.some((r: { role: string }) => r.role === ProjectMembershipRole.Admin)) {
          pamProjectAdmins.add(member.userId);
        }
      }
    }

    for (const [userId] of allPamUsers) {
      const isProductAdmin = orgAdmins.has(userId) && pamProjectAdmins.has(userId);

      const [membership] = await knex(TableName.Membership)
        .insert({
          scope: AccessScope.Project,
          scopeOrgId: orgId,
          scopeProjectId: newProjectId,
          actorUserId: userId,
          isActive: true
        })
        .returning("id");

      await knex(TableName.MembershipRole).insert({
        membershipId: membership.id,
        role: isProductAdmin ? PamProductRole.Admin : PamProductRole.Member
      });
    }

    for (const project of oldPamProjects) {
      const folderId = projectToFolder[project.id];

      const projectMembers = await knex(TableName.Membership)
        .where({ scope: AccessScope.Project, scopeProjectId: project.id, isActive: true })
        .whereNotNull("actorUserId")
        .select("id", "actorUserId as userId");

      for (const member of projectMembers) {
        const roles = await knex(TableName.MembershipRole).where("membershipId", member.id).select("role");

        const isAdmin = roles.some((r: { role: string }) => r.role === ProjectMembershipRole.Admin);
        const folderRole = isAdmin ? PamFolderRole.Admin : PamFolderRole.Connector;

        const [folderMembership] = await knex(TableName.Membership)
          .insert({
            scope: RESOURCE_SCOPE,
            scopeOrgId: orgId,
            scopeProjectId: newProjectId,
            scopeResourceType: ResourceType.PamFolder,
            scopeResourceId: folderId,
            actorUserId: member.userId,
            isActive: true
          })
          .returning("id");

        await knex(TableName.MembershipRole).insert({
          membershipId: folderMembership.id,
          role: folderRole
        });
      }
    }
  }

  // Clean up orphaned accounts and deduplicate before adding constraints
  await knex(TableName.PamAccount)
    .where((qb) => qb.whereNull("folderId").orWhereNull("templateId"))
    .delete();

  await knex.raw(`
    UPDATE ${TableName.PamAccount} a
    SET name = a.name || '-' || LEFT(a.id::text, 8)
    FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY "folderId", name ORDER BY "createdAt") AS rn
      FROM ${TableName.PamAccount}
      WHERE "folderId" IS NOT NULL
    ) dups
    WHERE a.id = dups.id AND dups.rn > 1
  `);

  await knex.raw(`DROP INDEX IF EXISTS "uidx_pam_account_children_name"`);
  await knex.raw(`DROP INDEX IF EXISTS "uidx_pam_account_root_name"`);

  await knex.schema.alterTable(TableName.PamAccount, (t) => {
    t.uuid("orgId").notNullable().alter();
    t.uuid("templateId").notNullable().alter();
    t.binary("encryptedConnectionDetails").notNullable().alter();
    t.dropColumn("projectId");
    t.dropColumn("resourceId");
    t.dropColumn("domainId");
    t.dropColumn("policyId");
    t.dropColumn("lastRotatedAt");
    t.dropColumn("rotationStatus");
    t.dropColumn("encryptedLastRotationMessage");
    t.dropColumn("requireMfa");
    t.dropColumn("internalMetadata");
    t.dropColumn("discoveryFingerprint");
    t.unique(["folderId", "name"]);
  });

  // Sessions
  await knex.schema.alterTable(TableName.PamSession, (t) => {
    t.uuid("orgId").nullable();
    t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    t.index("orgId");
    t.string("folderName").nullable();
    t.string("selectedHost").nullable();
  });

  await knex.raw(`
    UPDATE ${TableName.PamSession} s
    SET "orgId" = p."orgId"
    FROM ${TableName.Project} p
    WHERE s."projectId" = p.id
  `);

  await knex(TableName.PamSession).whereNull("orgId").delete();

  await knex.schema.alterTable(TableName.PamSession, (t) => {
    t.uuid("orgId").notNullable().alter();
  });

  await knex.schema.alterTable(TableName.PamSession, (t) => {
    t.renameColumn("resourceType", "accountType");
  });

  await knex.schema.alterTable(TableName.PamSession, (t) => {
    t.dropColumn("projectId");
    t.dropColumn("resourceName");
    t.dropColumn("resourceId");
    t.dropColumn("selectedResourceId");
    t.dropColumn("encryptedAiInsights");
    t.dropColumn("aiInsightsStatus");
    t.dropColumn("aiInsightsError");
  });
}

export async function down(): Promise<void> {
  // No down migration or it will error
}
