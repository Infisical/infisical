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

// Batched: the per-org insert loop is round-trip-bound and holds write-blocking locks on hot
// tables for ~15 statements x org count (12+ min at Cloud scale); chunked inserts take seconds.
const PROJECT_INSERT_CHUNK = 500;
const TEMPLATE_INSERT_CHUNK = 1000;
const BACKUP_TABLE = "pam_revamp_backup";

type TMembershipActor = {
  actorUserId?: string | null;
  actorIdentityId?: string | null;
  actorGroupId?: string | null;
};

const membershipActorKey = (m: TMembershipActor) => {
  if (m.actorUserId) return `user:${m.actorUserId}`;
  if (m.actorIdentityId) return `identity:${m.actorIdentityId}`;
  return `group:${m.actorGroupId}`;
};

const membershipActorColumns = (key: string) => ({
  actorUserId: key.startsWith("user:") ? key.slice("user:".length) : null,
  actorIdentityId: key.startsWith("identity:") ? key.slice("identity:".length) : null,
  actorGroupId: key.startsWith("group:") ? key.slice("group:".length) : null
});

const whereAnyActor = (qb: Knex.QueryBuilder, prefix = "") => {
  void qb
    .whereNotNull(`${prefix}actorUserId`)
    .orWhereNotNull(`${prefix}actorIdentityId`)
    .orWhereNotNull(`${prefix}actorGroupId`);
};

type TRoleRow = {
  role: string;
  isTemporary: boolean;
  temporaryMode?: string | null;
  temporaryRange?: string | null;
  temporaryAccessStartTime?: Date | null;
  temporaryAccessEndTime?: Date | null;
};

const ROLE_ROW_COLUMNS = [
  "role",
  "isTemporary",
  "temporaryMode",
  "temporaryRange",
  "temporaryAccessStartTime",
  "temporaryAccessEndTime"
];

// Mirrors isActiveRole in permission-service.ts: an expired temporary role grants nothing
const isActiveRoleRow = (r: TRoleRow) =>
  !r.isTemporary || Boolean(r.temporaryAccessEndTime && new Date() < new Date(r.temporaryAccessEndTime));

// Only old-project admins keep standing folder access, mapped to folder Admin with their
// temporal window preserved. Non-admins get product membership only and request access
// through the approval flow, so they are not added to any folder.
const mapToFolderAdminRoleRows = (activeRoles: TRoleRow[]) => {
  const mapped = new Map<string, Omit<TRoleRow, "role"> & { role: string }>();
  for (const r of activeRoles) {
    if (r.role !== ProjectMembershipRole.Admin) {
      // eslint-disable-next-line no-continue
      continue;
    }
    const row = {
      role: PamResourceRole.Admin,
      isTemporary: r.isTemporary,
      temporaryMode: r.temporaryMode ?? null,
      temporaryRange: r.temporaryRange ?? null,
      temporaryAccessStartTime: r.temporaryAccessStartTime ?? null,
      temporaryAccessEndTime: r.temporaryAccessEndTime ?? null
    };
    const key = JSON.stringify(row);
    if (!mapped.has(key)) mapped.set(key, row);
  }
  return [...mapped.values()];
};

// Only orgs with existing PAM data get a project here; the rest are created lazily on first access
// (see pamProjectResolver) to avoid backfilling tens of thousands of empty projects.
const backfillPamProjectsForOrgs = async (knex: Knex, orgIds: string[]) => {
  const orgToPamProject = new Map<string, string>();

  for (let i = 0; i < orgIds.length; i += PROJECT_INSERT_CHUNK) {
    const orgChunk = orgIds.slice(i, i + PROJECT_INSERT_CHUNK);

    const insertedProjects = (await knex(TableName.Project)
      .insert(
        orgChunk.map((orgId) => ({
          name: "Privileged Access Manager",
          slug: slugify(`pam-${alphaNumericNanoId(4)}`),
          type: ProjectType.PAM,
          orgId,
          version: 3,
          pitVersionLimit: 10
        }))
      )
      .returning(["id", "orgId"])) as Array<{ id: string; orgId: string }>;

    for (const { id, orgId } of insertedProjects) {
      orgToPamProject.set(orgId, id);
    }

    await knex(BACKUP_TABLE).insert(
      insertedProjects.map(({ id, orgId }) => ({
        entityType: "created_project",
        entityId: id,
        before: { orgId }
      }))
    );

    const templateRows = insertedProjects.flatMap(({ id: projectId }) =>
      DEFAULT_ACCOUNT_TEMPLATES.map((template) => ({
        projectId,
        name: template.name,
        type: template.type,
        settings: template.settings
      }))
    );

    for (let j = 0; j < templateRows.length; j += TEMPLATE_INSERT_CHUNK) {
      await knex(TableName.PamAccountTemplate)
        .insert(templateRows.slice(j, j + TEMPLATE_INSERT_CHUNK))
        .onConflict(["projectId", "name"])
        .ignore();
    }
  }

  return orgToPamProject;
};

export async function up(knex: Knex): Promise<void> {
  // The migration commits atomically, so this table existing means it already ran fully.
  // Guarding the whole run: a partial re-run would null folderIds and delete migrated accounts.
  if (await knex.schema.hasTable(TableName.PamAccountTemplate)) {
    return;
  }

  // Sidecar recording the before-state of everything this migration overwrites in place,
  // written in the same transaction. down() replays it verbatim; drop once rollback is moot.
  await knex.schema.createTable(BACKUP_TABLE, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
    t.string("entityType").notNullable();
    t.index("entityType");
    t.string("entityId", 36).notNullable();
    t.jsonb("before").nullable();
    t.binary("beforeCredentials").nullable();
    t.binary("beforeSessionKey").nullable();
    t.binary("beforeLogsBlob").nullable();
    t.timestamps(true, true, true);
  });

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

  const orgToPamProject = await backfillPamProjectsForOrgs(
    knex,
    orgsWithPam.map((o) => o.orgId)
  );

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
  const { kmsService } = await getMigrationEncryptionServices({
    envConfig,
    keyStore,
    db: knex,
    skipHsmLicenseCheck: true
  });

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
          `${TableName.PamAccount}.name as accountName`,
          `${TableName.PamAccount}.projectId as accountProjectId`,
          `${TableName.PamAccount}.encryptedCredentials`,
          `${TableName.PamResource}.resourceType`,
          `${TableName.PamResource}.encryptedConnectionDetails`,
          `${TableName.PamResource}.encryptedResourceMetadata`,
          `${TableName.PamResource}.gatewayId`,
          `${TableName.PamResource}.gatewayPoolId`
        );

      // Any failure here throws and rolls back the whole migration rather than
      // silently dropping the account via the null-folder assertion below
      for (const account of resourceAccounts) {
        const templateId = templateMap[account.resourceType];
        if (!templateId) {
          throw new Error(
            `PAM migration: no template for resource account [accountId=${account.accountId}] [type=${account.resourceType}]`
          );
        }
        await knex(BACKUP_TABLE).insert({
          entityType: "account",
          entityId: account.accountId,
          before: { projectId: account.accountProjectId, name: account.accountName },
          beforeCredentials: account.encryptedCredentials
        });
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

      const domainAccounts = await knex(TableName.PamAccount)
        .join(TableName.PamDomain, `${TableName.PamAccount}.domainId`, `${TableName.PamDomain}.id`)
        .where(`${TableName.PamDomain}.projectId`, oldProjectId)
        .select(
          `${TableName.PamAccount}.id as accountId`,
          `${TableName.PamAccount}.name as accountName`,
          `${TableName.PamAccount}.projectId as accountProjectId`,
          `${TableName.PamAccount}.encryptedCredentials`,
          `${TableName.PamDomain}.domainType`,
          `${TableName.PamDomain}.encryptedConnectionDetails`,
          `${TableName.PamDomain}.gatewayId`,
          `${TableName.PamDomain}.gatewayPoolId`
        );

      for (const account of domainAccounts) {
        // active-directory domains became the windows-ad account type
        const isActiveDirectory = account.domainType === "active-directory";
        const templateType = isActiveDirectory ? "windows-ad" : account.domainType;
        const templateId = templateMap[templateType];
        if (!templateId) {
          throw new Error(
            `PAM migration: no template for domain account [accountId=${account.accountId}] [type=${account.domainType}]`
          );
        }
        await knex(BACKUP_TABLE).insert({
          entityType: "account",
          entityId: account.accountId,
          before: { projectId: account.accountProjectId, name: account.accountName },
          beforeCredentials: account.encryptedCredentials
        });
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
    }

    // Migrate permissions for users, machine identities, and groups
    const orgAdmins = new Set(
      (
        await knex(TableName.Membership)
          .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
          .where(`${TableName.Membership}.scope`, AccessScope.Organization)
          .where(`${TableName.Membership}.scopeOrgId`, orgId)
          .where(`${TableName.Membership}.isActive`, true)
          .where(`${TableName.MembershipRole}.role`, OrgMembershipRole.Admin)
          .where(`${TableName.MembershipRole}.isTemporary`, false)
          .where((qb) => whereAnyActor(qb, `${TableName.Membership}.`))
          .select(
            `${TableName.Membership}.actorUserId`,
            `${TableName.Membership}.actorIdentityId`,
            `${TableName.Membership}.actorGroupId`
          )
      ).map((m: TMembershipActor) => membershipActorKey(m))
    );

    const pamProjectAdmins = new Set<string>();
    const allPamActors = new Set<string>();

    for (const project of oldPamProjects) {
      const projectMembers = await knex(TableName.Membership)
        .where({ scope: AccessScope.Project, scopeProjectId: project.id, isActive: true })
        .where((qb) => whereAnyActor(qb))
        .select("id", "actorUserId", "actorIdentityId", "actorGroupId");

      for (const member of projectMembers) {
        const roles = (await knex(TableName.MembershipRole)
          .where("membershipId", member.id)
          .select(ROLE_ROW_COLUMNS)) as TRoleRow[];
        const activeRoles = roles.filter(isActiveRoleRow);

        if (activeRoles.length > 0) {
          const actor = membershipActorKey(member);
          allPamActors.add(actor);

          // Product admin requires a permanent admin role; temporary admins must not
          // become permanent product admins
          if (activeRoles.some((r) => r.role === ProjectMembershipRole.Admin && !r.isTemporary)) {
            pamProjectAdmins.add(actor);
          }
        }
      }
    }

    for (const actor of allPamActors) {
      const isProductAdmin = orgAdmins.has(actor) && pamProjectAdmins.has(actor);

      const [membership] = await knex(TableName.Membership)
        .insert({
          scope: AccessScope.Project,
          scopeOrgId: orgId,
          scopeProjectId: newProjectId,
          ...membershipActorColumns(actor),
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
        .where((qb) => whereAnyActor(qb))
        .select("id", "actorUserId", "actorIdentityId", "actorGroupId");

      for (const member of projectMembers) {
        const roles = (await knex(TableName.MembershipRole)
          .where("membershipId", member.id)
          .select(ROLE_ROW_COLUMNS)) as TRoleRow[];
        const folderRoleRows = mapToFolderAdminRoleRows(roles.filter(isActiveRoleRow));

        if (folderRoleRows.length > 0) {
          const [folderMembership] = await knex(TableName.Membership)
            .insert({
              scope: RESOURCE_SCOPE,
              scopeOrgId: orgId,
              scopeProjectId: newProjectId,
              scopeResourceType: ResourceType.PamFolder,
              scopeResourceId: folderId,
              ...membershipActorColumns(membershipActorKey(member)),
              isActive: true
            })
            .returning("id");

          await knex(TableName.MembershipRole).insert(
            folderRoleRows.map((r) => ({ membershipId: folderMembership.id, ...r }))
          );
        }
      }
    }
  }

  // Every account must have been migrated above; fail loudly instead of deleting strays
  const orphanedAccounts = (await knex(TableName.PamAccount)
    .where((qb) => {
      void qb.whereNull("folderId").orWhereNull("templateId");
    })
    .select("id")) as Array<{ id: string }>;

  if (orphanedAccounts.length > 0) {
    throw new Error(
      `PAM migration: ${orphanedAccounts.length} account(s) were not migrated [ids=${orphanedAccounts
        .map((a) => a.id)
        .join(", ")}]`
    );
  }

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

      await knex(BACKUP_TABLE).insert({
        entityType: "session",
        entityId: session.id,
        before: { projectId: session.projectId },
        beforeSessionKey: session.encryptedSessionKey,
        beforeLogsBlob: session.encryptedLogsBlob
      });

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

  // Accounts existing at migration time were created with credentials supplied upfront
  await knex.schema.alterTable(TableName.PamAccount, (t) => {
    t.boolean("credentialConfigured").notNullable().defaultTo(false);
  });

  await knex(TableName.PamAccount).update({ credentialConfigured: true });
}

// Replays the pam_revamp_backup sidecar verbatim: no re-derivation, no crypto. Only valid
// while old-world zombie projects still exist. Post-rollback, the old app release must be
// deployed and the PamDefaultProject:* keystore cache keys cleared.
export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(BACKUP_TABLE))) {
    if (!(await knex.schema.hasTable(TableName.PamAccountTemplate))) return;
    throw new Error(`PAM revert: ${BACKUP_TABLE} table is missing; restore from a database backup instead`);
  }

  // Accounts created after the migration have no old-world home; a human must export or
  // delete them before reverting
  const strayAccounts = (await knex(TableName.PamAccount)
    .whereNotIn("id", knex(BACKUP_TABLE).where("entityType", "account").select(knex.raw(`"entityId"::uuid`)))
    .select("id")) as Array<{ id: string }>;
  if (strayAccounts.length > 0) {
    throw new Error(
      `PAM revert: ${strayAccounts.length} account(s) were created after the migration; export or delete them first [ids=${strayAccounts
        .map((a) => a.id)
        .join(", ")}]`
    );
  }

  const accountBackups = await knex(BACKUP_TABLE).where("entityType", "account");
  for (const backup of accountBackups) {
    const before = backup.before as { projectId: string; name: string };
    await knex(TableName.PamAccount).where("id", backup.entityId).update({
      projectId: before.projectId,
      name: before.name,
      folderId: null,
      encryptedCredentials: backup.beforeCredentials
    });
  }

  const sessionBackups = await knex(BACKUP_TABLE).where("entityType", "session");
  for (const backup of sessionBackups) {
    const before = backup.before as { projectId: string };
    await knex(TableName.PamSession).where("id", backup.entityId).update({
      projectId: before.projectId,
      encryptedSessionKey: backup.beforeSessionKey,
      encryptedLogsBlob: backup.beforeLogsBlob
    });
  }

  // Drop the new account columns before deleting created projects: templateId's RESTRICT FK
  // would otherwise block the template cascade
  await knex.schema.alterTable(TableName.PamAccount, (t) => {
    t.dropUnique(["folderId", "name"]);
    t.dropForeign(["folderId"]);
    t.dropColumn("templateId");
    t.dropColumn("encryptedConnectionDetails");
    t.dropColumn("encryptedInternalMetadata");
    t.dropColumn("gatewayId");
    t.dropColumn("gatewayPoolId");
    t.dropColumn("recordingConnectionId");
    t.dropColumn("settingsOverrides");
    t.dropColumn("credentialConfigured");
  });

  // Cascades clean up the created projects' memberships, templates, folders, and any
  // post-migration sessions
  const createdProjectIds = (await knex(BACKUP_TABLE).where("entityType", "created_project").select("entityId")).map(
    (r: { entityId: string }) => r.entityId
  );
  for (let i = 0; i < createdProjectIds.length; i += PROJECT_INSERT_CHUNK) {
    await knex(TableName.Project)
      .whereIn("id", createdProjectIds.slice(i, i + PROJECT_INSERT_CHUNK))
      .delete();
  }

  await dropOnUpdateTrigger(knex, TableName.PamFolder);
  await knex.schema.dropTable(TableName.PamFolder);

  // Old-shape folders table from 20250917052037_pam.ts (dead unfinished feature; rows were
  // never used so only the schema is restored)
  await knex.schema.createTable(TableName.PamFolder, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

    t.string("projectId").notNullable();
    t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    t.index("projectId");

    t.uuid("parentId").nullable();
    t.foreign("parentId").references("id").inTable(TableName.PamFolder).onDelete("CASCADE");
    t.index("parentId");

    t.string("name").notNullable();
    t.index("name");

    t.unique(["projectId", "parentId", "name"], {
      indexName: "uidx_pam_folder_children_name",
      predicate: knex.whereNotNull("parentId")
    });

    t.unique(["projectId", "name"], {
      indexName: "uidx_pam_folder_root_name",
      predicate: knex.whereNull("parentId")
    });

    t.text("description").nullable();

    t.timestamps(true, true, true);
  });

  await createOnUpdateTrigger(knex, TableName.PamFolder);

  await knex.schema.alterTable(TableName.PamAccount, (t) => {
    t.foreign("folderId").references("id").inTable(TableName.PamFolder).onDelete("CASCADE");
    t.string("projectId").notNullable().alter();
  });

  await knex.raw(`
    ALTER TABLE ${TableName.PamAccount}
    ADD CONSTRAINT chk_pam_account_parent
    CHECK (
      (("resourceId" IS NOT NULL AND "domainId" IS NULL) OR ("resourceId" IS NULL AND "domainId" IS NOT NULL))
    )
  `);

  await knex.schema.alterTable(TableName.PamSession, (t) => {
    t.renameColumn("accountType", "resourceType");
    t.dropColumn("folderName");
    t.dropColumn("selectedHost");
    t.string("resourceName").notNullable().alter();
  });

  await dropOnUpdateTrigger(knex, TableName.PamAccountTemplate);
  await knex.schema.dropTable(TableName.PamAccountTemplate);

  await knex.schema.dropTable(BACKUP_TABLE);
}
