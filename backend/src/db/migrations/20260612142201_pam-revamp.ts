/* eslint-disable no-await-in-loop */
import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { PamProductRole, PamResourceRole } from "@app/ee/services/pam/pam-enums";
import { DEFAULT_ACCOUNT_TEMPLATES } from "@app/ee/services/pam-project/pam-project-bootstrap";
import { inMemoryKeyStore } from "@app/keystore/memory";
import { crypto } from "@app/lib/crypto/cryptography";
import { initLogger, logger } from "@app/lib/logger";
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

const seedDefaultTemplates = async (knex: Knex, projectId: string) => {
  for (const template of DEFAULT_ACCOUNT_TEMPLATES) {
    await knex(TableName.PamAccountTemplate)
      .insert({
        projectId,
        name: template.name,
        type: template.type,
        settings: template.settings
      })
      .onConflict(["projectId", "name"])
      .ignore();
  }
};

const createPamProjectForOrg = async (knex: Knex, orgId: string) => {
  const slug = slugify(`pam-${alphaNumericNanoId(4)}`);

  const [{ id: projectId }] = (await knex(TableName.Project)
    .insert({
      name: "Privileged Access Manager",
      slug,
      type: ProjectType.PAM,
      orgId,
      version: 3,
      pitVersionLimit: 10
    })
    .returning("id")) as Array<{ id: string }>;

  await seedDefaultTemplates(knex, projectId);

  return projectId;
};

const backfillPamProjectsForAllOrgs = async (knex: Knex) => {
  const allOrgs = (await knex(TableName.Organization).select("id")) as Array<{ id: string }>;
  const orgToPamProject = new Map<string, string>();

  for (const { id } of allOrgs) {
    const projectId = await createPamProjectForOrg(knex, id);
    orgToPamProject.set(id, projectId);
  }

  return orgToPamProject;
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(TableName.PamAccountTemplate, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

    t.string("projectId").notNullable();
    t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    t.index("projectId");

    t.string("name").notNullable();
    t.text("description").nullable();

    t.string("type").notNullable();
    t.index("type");

    t.jsonb("policies").nullable();
    t.jsonb("settings").nullable();

    t.uuid("gatewayId").nullable();
    t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL");

    t.uuid("gatewayPoolId").nullable();
    t.foreign("gatewayPoolId").references("id").inTable(TableName.GatewayPool).onDelete("SET NULL");

    t.uuid("recordingConnectionId").nullable();
    t.foreign("recordingConnectionId").references("id").inTable(TableName.AppConnection).onDelete("SET NULL");

    t.unique(["projectId", "name"]);

    t.timestamps(true, true, true);
  });

  await createOnUpdateTrigger(knex, TableName.PamAccountTemplate);

  // Capture orgs that have a PAM project before backfill
  const orgsWithPam = await knex(TableName.Project).where("type", ProjectType.PAM).distinct("orgId").select("orgId");

  const orgToPamProject = await backfillPamProjectsForAllOrgs(knex);

  // Drop old folders table and recreate with new schema
  await knex.raw(`UPDATE ${TableName.PamAccount} SET "folderId" = NULL WHERE "folderId" IS NOT NULL`);
  await knex.schema.alterTable(TableName.PamAccount, (t) => {
    t.dropForeign(["folderId"]);
  });
  await dropOnUpdateTrigger(knex, TableName.PamFolder);
  await knex.schema.dropTable(TableName.PamFolder);

  await knex.schema.createTable(TableName.PamFolder, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

    t.string("projectId").notNullable();
    t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    t.index("projectId");

    t.string("name").notNullable();
    t.index("name");

    t.text("description").nullable();

    t.unique(["projectId", "name"]);

    t.timestamps(true, true, true);
  });

  await createOnUpdateTrigger(knex, TableName.PamFolder);

  await knex.schema.alterTable(TableName.PamAccount, (t) => {
    t.foreign("folderId").references("id").inTable(TableName.PamFolder).onDelete("RESTRICT");
  });

  // Add new columns to accounts
  await knex.raw(`ALTER TABLE ${TableName.PamAccount} DROP CONSTRAINT IF EXISTS chk_pam_account_parent`);

  await knex.schema.alterTable(TableName.PamAccount, (t) => {
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

  for (const { orgId } of orgsWithPam) {
    const newProjectId = orgToPamProject.get(orgId)!;
    const newProjectCipher = await getProjectCipher(newProjectId);

    const reEncrypt = (oldCipher: Awaited<ReturnType<typeof getProjectCipher>>, blob?: Buffer | null) => {
      if (!blob) return undefined;
      const plainText = oldCipher.decryptor({ cipherTextBlob: blob });
      return newProjectCipher.encryptor({ plainText }).cipherTextBlob;
    };

    const reEncryptAdConnectionDetails = (
      oldCipher: Awaited<ReturnType<typeof getProjectCipher>>,
      blob?: Buffer | null
    ) => {
      if (!blob) return undefined;
      const details = JSON.parse(oldCipher.decryptor({ cipherTextBlob: blob }).toString("utf-8")) as Record<
        string,
        unknown
      >;
      const transformed = {
        ...details,
        hosts: details.dcAddress ? [details.dcAddress] : [],
        rdpPort: 3389
      };
      return newProjectCipher.encryptor({ plainText: Buffer.from(JSON.stringify(transformed)) }).cipherTextBlob;
    };

    const templates = await knex(TableName.PamAccountTemplate).where({ projectId: newProjectId }).select("id", "type");
    const templateMap: Record<string, string> = {};
    for (const t of templates) {
      templateMap[t.type] = t.id;
    }

    const oldPamProjects = await knex(TableName.Project)
      .where({ orgId, type: ProjectType.PAM })
      .whereNot("id", newProjectId)
      .select("id", "name");

    const projectToFolder: Record<string, string> = {};

    const usedFolderNames = new Set<string>();
    for (const project of oldPamProjects) {
      let folderName = slugify(project.name) || project.id.slice(0, 8);
      if (usedFolderNames.has(folderName)) {
        folderName = `${folderName}-${project.id.slice(0, 8)}`;
      }
      usedFolderNames.add(folderName);
      const [folder] = await knex(TableName.PamFolder)
        .insert({ projectId: newProjectId, name: folderName })
        .returning("id");
      projectToFolder[project.id] = folder.id;
    }

    for (const [oldProjectId, folderId] of Object.entries(projectToFolder)) {
      const oldProjectCipher = await getProjectCipher(oldProjectId);

      const resourceAccounts = await knex(TableName.PamAccount)
        .join(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
        .where(`${TableName.PamResource}.projectId`, oldProjectId)
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
        try {
          const templateId = templateMap[account.resourceType];
          if (templateId) {
            await knex(TableName.PamAccount)
              .where("id", account.accountId)
              .update({
                projectId: newProjectId,
                folderId,
                templateId,
                encryptedCredentials: reEncrypt(oldProjectCipher, account.encryptedCredentials),
                encryptedConnectionDetails: reEncrypt(oldProjectCipher, account.encryptedConnectionDetails),
                encryptedInternalMetadata: reEncrypt(oldProjectCipher, account.encryptedResourceMetadata),
                gatewayId: account.gatewayId,
                gatewayPoolId: account.gatewayPoolId
              });
          }
        } catch (err) {
          logger.warn(
            { err, accountId: account.accountId },
            `PAM migration: failed to migrate resource account, skipping [accountId=${account.accountId}]`
          );
        }
      }

      const domainAccounts = await knex(TableName.PamAccount)
        .join(TableName.PamDomain, `${TableName.PamAccount}.domainId`, `${TableName.PamDomain}.id`)
        .where(`${TableName.PamDomain}.projectId`, oldProjectId)
        .select(
          `${TableName.PamAccount}.id as accountId`,
          `${TableName.PamAccount}.encryptedCredentials`,
          `${TableName.PamDomain}.domainType`,
          `${TableName.PamDomain}.encryptedConnectionDetails`,
          `${TableName.PamDomain}.gatewayId`,
          `${TableName.PamDomain}.gatewayPoolId`
        );

      for (const account of domainAccounts) {
        try {
          // active-directory domains became the windows-ad account type
          const isActiveDirectory = account.domainType === "active-directory";
          const templateType = isActiveDirectory ? "windows-ad" : account.domainType;
          const templateId = templateMap[templateType];
          if (templateId) {
            await knex(TableName.PamAccount)
              .where("id", account.accountId)
              .update({
                projectId: newProjectId,
                folderId,
                templateId,
                encryptedCredentials: reEncrypt(oldProjectCipher, account.encryptedCredentials),
                encryptedConnectionDetails: isActiveDirectory
                  ? reEncryptAdConnectionDetails(oldProjectCipher, account.encryptedConnectionDetails)
                  : reEncrypt(oldProjectCipher, account.encryptedConnectionDetails),
                gatewayId: account.gatewayId,
                gatewayPoolId: account.gatewayPoolId
              });
          }
        } catch (err) {
          logger.warn(
            { err, accountId: account.accountId },
            `PAM migration: failed to migrate domain account, skipping [accountId=${account.accountId}]`
          );
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

        // Migrated non-admins get product membership only (no standing folder/account access); they
        // request access through the approval flow. Only old-project admins keep a folder-Admin
        // membership so the migrated folder remains manageable.
        // eslint-disable-next-line no-continue
        if (!isAdmin) continue;

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
          role: PamResourceRole.Admin
        });
      }
    }
  }

  // Clean up orphaned accounts and deduplicate before adding constraints
  await knex(TableName.PamAccount)
    .where((qb) => {
      void qb.whereNull("folderId").orWhereNull("templateId");
    })
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
    t.uuid("templateId").notNullable().alter();
    t.binary("encryptedConnectionDetails").notNullable().alter();
    t.jsonb("settingsOverrides").nullable();
    t.unique(["folderId", "name"]);
    // Make retained old columns nullable so new accounts can be created without them
    t.string("projectId", 36).nullable().alter();
    t.uuid("resourceId").nullable().alter();
    t.uuid("domainId").nullable().alter();
    t.uuid("policyId").nullable().alter();
  });

  // Sessions
  await knex.schema.alterTable(TableName.PamSession, (t) => {
    t.string("folderName").nullable();
    t.string("selectedHost").nullable();
  });

  // Backfill folderName on existing sessions from account -> folder join
  await knex(TableName.PamSession)
    .whereNull("folderName")
    .whereNotNull("accountId")
    .update({
      folderName: knex(TableName.PamAccount)
        .join(TableName.PamFolder, `${TableName.PamAccount}.folderId`, `${TableName.PamFolder}.id`)
        .whereRaw(`${TableName.PamAccount}.id = ${TableName.PamSession}."accountId"`)
        .select(`${TableName.PamFolder}.name`)
        .first() as unknown as string
    });

  // Re-encrypt session data from old project key to new consolidated project key
  const SESSION_KEY_LENGTH = 32;
  const AAD_LENGTH = 32;
  const PAM_RECORDING_AAD_VERSION = "v1";

  const buildWrapAad = (scopeId: string, sessionId: string) =>
    crypto.nativeCrypto.createHash("sha256").update(`${scopeId}|${sessionId}|${PAM_RECORDING_AAD_VERSION}`).digest();

  const sessionsToMigrate = await knex(TableName.PamSession)
    .join(TableName.Project, `${TableName.PamSession}.projectId`, `${TableName.Project}.id`)
    .whereNotNull(`${TableName.PamSession}.projectId`)
    .select(
      `${TableName.PamSession}.id as id`,
      `${TableName.PamSession}.projectId as projectId`,
      `${TableName.Project}.orgId as orgId`,
      `${TableName.PamSession}.encryptedSessionKey`,
      `${TableName.PamSession}.encryptedLogsBlob`
    );

  const projectCipherCache = new Map<string, Awaited<ReturnType<typeof getProjectCipher>>>();

  for (const session of sessionsToMigrate) {
    try {
      const sessionNewProjectId = orgToPamProject.get(session.orgId);
      if (!sessionNewProjectId || session.projectId === sessionNewProjectId) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const updates: Record<string, Buffer | string | undefined> = { projectId: sessionNewProjectId };

      if (!projectCipherCache.has(session.projectId)) {
        projectCipherCache.set(session.projectId, await getProjectCipher(session.projectId));
      }
      if (!projectCipherCache.has(sessionNewProjectId)) {
        projectCipherCache.set(sessionNewProjectId, await getProjectCipher(sessionNewProjectId));
      }
      const oldCipher = projectCipherCache.get(session.projectId)!;
      const newCipher = projectCipherCache.get(sessionNewProjectId)!;

      if (session.encryptedSessionKey) {
        const decrypted = oldCipher.decryptor({ cipherTextBlob: session.encryptedSessionKey });
        const oldAad = decrypted.subarray(0, AAD_LENGTH);
        const sessionKey = decrypted.subarray(AAD_LENGTH, AAD_LENGTH + SESSION_KEY_LENGTH);

        const expectedOldAad = buildWrapAad(session.projectId, session.id);
        if (crypto.nativeCrypto.timingSafeEqual(oldAad, expectedOldAad)) {
          const newAad = buildWrapAad(sessionNewProjectId, session.id);
          const newPayload = Buffer.concat([newAad, sessionKey]);
          updates.encryptedSessionKey = newCipher.encryptor({ plainText: newPayload }).cipherTextBlob;
        } else {
          logger.warn(
            `PAM migration: skipping session key re-encryption due to AAD mismatch, recording will be unreadable [sessionId=${session.id}]`
          );
        }
      }

      if (session.encryptedLogsBlob) {
        const plainText = oldCipher.decryptor({ cipherTextBlob: session.encryptedLogsBlob });
        updates.encryptedLogsBlob = newCipher.encryptor({ plainText }).cipherTextBlob;
      }

      await knex(TableName.PamSession).where("id", session.id).update(updates);
    } catch (err) {
      logger.warn(
        { err, sessionId: session.id },
        `PAM migration: failed to re-encrypt session, skipping [sessionId=${session.id}]`
      );
    }
  }

  await knex.schema.alterTable(TableName.PamSession, (t) => {
    t.renameColumn("resourceType", "accountType");
    t.string("resourceName").nullable().alter();
  });
}

export async function down(): Promise<void> {
  // No down migration or it will error
}
