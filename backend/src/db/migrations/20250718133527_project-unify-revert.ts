import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";
import { v4 as uuidV4 } from "uuid";

import { alphaNumericNanoId } from "@app/lib/nanoid";

import { ProjectType, TableName } from "../schemas";

/* eslint-disable no-await-in-loop,@typescript-eslint/ban-ts-comment */

// Single query to get all projects that need any kind of kickout
const getProjectsNeedingKickouts = async (
  knex: Knex
): Promise<
  Array<{
    id: string;
    defaultProduct: string;
    needsSecretManager: boolean;
    needsCertManager: boolean;
    needsSecretScanning: boolean;
    needsKms: boolean;
    needsSsh: boolean;
  }>
> => {
  const result = await knex.raw(
    `
SELECT DISTINCT
  p.id,
  p."defaultProduct",
  
  -- Use CASE with direct joins instead of EXISTS subqueries
  CASE WHEN p."defaultProduct" != 'secret-manager' AND s.secret_exists IS NOT NULL THEN true ELSE false END AS "needsSecretManager",
  CASE WHEN p."defaultProduct" != 'cert-manager' AND ca.ca_exists IS NOT NULL THEN true ELSE false END AS "needsCertManager", 
  CASE WHEN p."defaultProduct" != 'secret-scanning' AND ssds.ssds_exists IS NOT NULL THEN true ELSE false END AS "needsSecretScanning",
  CASE WHEN p."defaultProduct" != 'kms' AND kk.kms_exists IS NOT NULL THEN true ELSE false END AS "needsKms",
  CASE WHEN p."defaultProduct" != 'ssh' AND sc.ssh_exists IS NOT NULL THEN true ELSE false END AS "needsSsh"

FROM projects p
LEFT JOIN (
  SELECT DISTINCT e."projectId", 1 as secret_exists
  FROM secrets_v2 s
  JOIN secret_folders sf ON sf.id = s."folderId"
  JOIN project_environments e ON e.id = sf."envId"
) s ON s."projectId" = p.id AND p."defaultProduct" != 'secret-manager'

LEFT JOIN (
  SELECT DISTINCT "projectId", 1 as ca_exists
  FROM certificate_authorities
) ca ON ca."projectId" = p.id AND p."defaultProduct" != 'cert-manager'

LEFT JOIN (
  SELECT DISTINCT "projectId", 1 as ssds_exists
  FROM secret_scanning_data_sources
) ssds ON ssds."projectId" = p.id AND p."defaultProduct" != 'secret-scanning'

LEFT JOIN (
  SELECT DISTINCT "projectId", 1 as kms_exists
  FROM kms_keys
  WHERE "isReserved" = false
) kk ON kk."projectId" = p.id AND p."defaultProduct" != 'kms'

LEFT JOIN (
  SELECT DISTINCT sca."projectId", 1 as ssh_exists
  FROM ssh_certificates sc
  JOIN ssh_certificate_authorities sca ON sca.id = sc."sshCaId"
) sc ON sc."projectId" = p.id AND p."defaultProduct" != 'ssh'

WHERE p."defaultProduct" IS NOT NULL
  AND (
    (p."defaultProduct" != 'secret-manager' AND s.secret_exists IS NOT NULL) OR
    (p."defaultProduct" != 'cert-manager' AND ca.ca_exists IS NOT NULL) OR
    (p."defaultProduct" != 'secret-scanning' AND ssds.ssds_exists IS NOT NULL) OR
    (p."defaultProduct" != 'kms' AND kk.kms_exists IS NOT NULL) OR
    (p."defaultProduct" != 'ssh' AND sc.ssh_exists IS NOT NULL)
  )
    `
  );

  return result.rows;
};

const newProject = async (knex: Knex, projectId: string, projectType: ProjectType) => {
  const newProjectId = uuidV4();
  const project = await knex(TableName.Project).where("id", projectId).first();
  await knex(TableName.Project).insert({
    ...project,
    type: projectType,
    defaultProduct: null,
    // @ts-ignore id is required
    id: newProjectId,
    slug: slugify(`${project?.name}-${alphaNumericNanoId(8)}`)
  });

  const customRoleMapping: Record<string, string> = {};
  const projectCustomRoles = await knex(TableName.ProjectRoles).where("projectId", projectId);
  if (projectCustomRoles.length) {
    await knex.batchInsert(
      TableName.ProjectRoles,
      projectCustomRoles.map((el) => {
        const id = uuidV4();
        customRoleMapping[el.id] = id;
        return {
          ...el,
          id,
          projectId: newProjectId,
          permissions: el.permissions ? JSON.stringify(el.permissions) : el.permissions
        };
      })
    );
  }
  const groupMembershipMapping: Record<string, string> = {};
  const groupMemberships = await knex(TableName.GroupProjectMembership).where("projectId", projectId);
  if (groupMemberships.length) {
    await knex.batchInsert(
      TableName.GroupProjectMembership,
      groupMemberships.map((el) => {
        const id = uuidV4();
        groupMembershipMapping[el.id] = id;
        return { ...el, id, projectId: newProjectId };
      })
    );
  }

  const groupMembershipRoles = await knex(TableName.GroupProjectMembershipRole).whereIn(
    "projectMembershipId",
    groupMemberships.map((el) => el.id)
  );
  if (groupMembershipRoles.length) {
    await knex.batchInsert(
      TableName.GroupProjectMembershipRole,
      groupMembershipRoles.map((el) => {
        const id = uuidV4();
        const projectMembershipId = groupMembershipMapping[el.projectMembershipId];
        const customRoleId = el.customRoleId ? customRoleMapping[el.customRoleId] : el.customRoleId;
        return { ...el, id, projectMembershipId, customRoleId };
      })
    );
  }

  const identityProjectMembershipMapping: Record<string, string> = {};
  const identities = await knex(TableName.IdentityProjectMembership).where("projectId", projectId);
  if (identities.length) {
    await knex.batchInsert(
      TableName.IdentityProjectMembership,
      identities.map((el) => {
        const id = uuidV4();
        identityProjectMembershipMapping[el.id] = id;
        return { ...el, id, projectId: newProjectId };
      })
    );
  }

  const identitiesRoles = await knex(TableName.IdentityProjectMembershipRole).whereIn(
    "projectMembershipId",
    identities.map((el) => el.id)
  );
  if (identitiesRoles.length) {
    await knex.batchInsert(
      TableName.IdentityProjectMembershipRole,
      identitiesRoles.map((el) => {
        const id = uuidV4();
        const projectMembershipId = identityProjectMembershipMapping[el.projectMembershipId];
        const customRoleId = el.customRoleId ? customRoleMapping[el.customRoleId] : el.customRoleId;
        return { ...el, id, projectMembershipId, customRoleId };
      })
    );
  }

  const projectMembershipMapping: Record<string, string> = {};
  const projectUserMembers = await knex(TableName.ProjectMembership).where("projectId", projectId);
  if (projectUserMembers.length) {
    await knex.batchInsert(
      TableName.ProjectMembership,
      projectUserMembers.map((el) => {
        const id = uuidV4();
        projectMembershipMapping[el.id] = id;
        return { ...el, id, projectId: newProjectId };
      })
    );
  }
  const membershipRoles = await knex(TableName.ProjectUserMembershipRole).whereIn(
    "projectMembershipId",
    projectUserMembers.map((el) => el.id)
  );
  if (membershipRoles.length) {
    await knex.batchInsert(
      TableName.ProjectUserMembershipRole,
      membershipRoles.map((el) => {
        const id = uuidV4();
        const projectMembershipId = projectMembershipMapping[el.projectMembershipId];
        const customRoleId = el.customRoleId ? customRoleMapping[el.customRoleId] : el.customRoleId;
        return { ...el, id, projectMembershipId, customRoleId };
      })
    );
  }

  const kmsKeys = await knex(TableName.KmsKey).where("projectId", projectId).andWhere("isReserved", true);
  if (kmsKeys.length) {
    await knex.batchInsert(
      TableName.KmsKey,
      kmsKeys.map((el) => {
        const id = uuidV4();
        const slug = slugify(alphaNumericNanoId(8).toLowerCase());
        return { ...el, id, slug, projectId: newProjectId };
      })
    );
  }

  const projectBot = await knex(TableName.ProjectBot).where("projectId", projectId).first();
  if (projectBot) {
    const newProjectBot = { ...projectBot, id: uuidV4(), projectId: newProjectId };
    await knex(TableName.ProjectBot).insert(newProjectBot);
  }

  const projectKeys = await knex(TableName.ProjectKeys).where("projectId", projectId);
  if (projectKeys.length) {
    await knex.batchInsert(
      TableName.ProjectKeys,
      projectKeys.map((el) => {
        const id = uuidV4();
        return { ...el, id, projectId: newProjectId };
      })
    );
  }

  const projectGateways = await knex(TableName.ProjectGateway).where("projectId", projectId);
  if (projectGateways.length) {
    await knex.batchInsert(
      TableName.ProjectGateway,
      projectGateways.map((el) => {
        const id = uuidV4();
        return { ...el, id, projectId: newProjectId };
      })
    );
  }

  const projectSlackConfigs = await knex(TableName.ProjectSlackConfigs).where("projectId", projectId);
  if (projectSlackConfigs.length) {
    await knex.batchInsert(
      TableName.ProjectSlackConfigs,
      projectSlackConfigs.map((el) => {
        const id = uuidV4();
        return { ...el, id, projectId: newProjectId };
      })
    );
  }

  const projectMicrosoftTeamsConfigs = await knex(TableName.ProjectMicrosoftTeamsConfigs).where("projectId", projectId);
  if (projectMicrosoftTeamsConfigs.length) {
    await knex.batchInsert(
      TableName.ProjectMicrosoftTeamsConfigs,
      projectMicrosoftTeamsConfigs.map((el) => {
        const id = uuidV4();
        return { ...el, id, projectId: newProjectId };
      })
    );
  }

  const trustedIps = await knex(TableName.TrustedIps).where("projectId", projectId);
  if (trustedIps.length) {
    await knex.batchInsert(
      TableName.TrustedIps,
      trustedIps.map((el) => {
        const id = uuidV4();
        return { ...el, id, projectId: newProjectId };
      })
    );
  }

  return newProjectId;
};

const kickOutSecretManagerProject = async (knex: Knex, oldProjectId: string) => {
  const newProjectId = await newProject(knex, oldProjectId, ProjectType.SecretManager);
  await knex(TableName.IntegrationAuth).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.Environment).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.SecretBlindIndex).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.SecretSync).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.SecretTag).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.SecretReminderRecipients).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.ServiceToken).where("projectId", oldProjectId).update("projectId", newProjectId);
};

const kickOutCertManagerProject = async (knex: Knex, oldProjectId: string) => {
  const newProjectId = await newProject(knex, oldProjectId, ProjectType.CertificateManager);
  await knex(TableName.CertificateAuthority).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.Certificate).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.PkiSubscriber).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.PkiCollection).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.PkiAlert).where("projectId", oldProjectId).update("projectId", newProjectId);
};

const kickOutSecretScanningProject = async (knex: Knex, oldProjectId: string) => {
  const newProjectId = await newProject(knex, oldProjectId, ProjectType.SecretScanning);
  await knex(TableName.SecretScanningConfig).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.SecretScanningDataSource).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.SecretScanningFinding).where("projectId", oldProjectId).update("projectId", newProjectId);
};

const kickOutKmsProject = async (knex: Knex, oldProjectId: string) => {
  const newProjectId = await newProject(knex, oldProjectId, ProjectType.KMS);
  await knex(TableName.KmsKey)
    .where("projectId", oldProjectId)
    .andWhere("isReserved", false)
    .update("projectId", newProjectId);
  await knex(TableName.KmipClient).where("projectId", oldProjectId).update("projectId", newProjectId);
};

const kickOutSshProject = async (knex: Knex, oldProjectId: string) => {
  const newProjectId = await newProject(knex, oldProjectId, ProjectType.SSH);
  await knex(TableName.SshHost).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.ProjectSshConfig).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.SshCertificateAuthority).where("projectId", oldProjectId).update("projectId", newProjectId);
  await knex(TableName.SshHostGroup).where("projectId", oldProjectId).update("projectId", newProjectId);
};

const BATCH_SIZE = 1000;
const MIGRATION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export async function up(knex: Knex): Promise<void> {
  const result = await knex.raw("SHOW statement_timeout");
  const originalTimeout = result.rows[0].statement_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);

    const hasTemplateTypeColumn = await knex.schema.hasColumn(TableName.ProjectTemplates, "type");
    if (hasTemplateTypeColumn) {
      await knex(TableName.ProjectTemplates).whereNull("type").update({
        type: ProjectType.SecretManager
      });
      await knex.schema.alterTable(TableName.ProjectTemplates, (t) => {
        t.string("type").notNullable().defaultTo(ProjectType.SecretManager).alter();
      });
    }

    const hasTypeColumn = await knex.schema.hasColumn(TableName.Project, "type");
    const hasDefaultTypeColumn = await knex.schema.hasColumn(TableName.Project, "defaultProduct");
    if (hasTypeColumn && hasDefaultTypeColumn) {
      await knex(TableName.Project).update({
        // eslint-disable-next-line
        // @ts-ignore this is because this field is created later
        type: knex.raw(`"defaultProduct"`)
      });

      await knex.schema.alterTable(TableName.Project, (t) => {
        t.string("type").notNullable().alter();
        t.string("defaultProduct").nullable().alter();
      });

      // Get all projects that need kickouts in a single query
      const projectsNeedingKickouts = await getProjectsNeedingKickouts(knex);

      // Process projects in batches to avoid overwhelming the database
      for (let i = 0; i < projectsNeedingKickouts.length; i += projectsNeedingKickouts.length) {
        const batch = projectsNeedingKickouts.slice(i, i + BATCH_SIZE);
        const processedIds: string[] = [];

        for (const project of batch) {
          const kickoutPromises: Promise<void>[] = [];

          // Only add kickouts that are actually needed (flags are pre-computed)
          if (project.needsSecretManager) {
            kickoutPromises.push(kickOutSecretManagerProject(knex, project.id));
          }
          if (project.needsCertManager) {
            kickoutPromises.push(kickOutCertManagerProject(knex, project.id));
          }
          if (project.needsKms) {
            kickoutPromises.push(kickOutKmsProject(knex, project.id));
          }
          if (project.needsSsh) {
            kickoutPromises.push(kickOutSshProject(knex, project.id));
          }
          if (project.needsSecretScanning) {
            kickoutPromises.push(kickOutSecretScanningProject(knex, project.id));
          }

          // Execute all kickouts in parallel and handle any failures gracefully
          if (kickoutPromises.length > 0) {
            const results = await Promise.allSettled(kickoutPromises);

            // Log any failures for debugging
            results.forEach((res) => {
              if (res.status === "rejected") {
                throw new Error(`Migration failed for project ${project.id}: ${res.reason}`);
              }
            });
          }

          processedIds.push(project.id);
        }

        // Clear defaultProduct for the processed batch
        if (processedIds.length > 0) {
          await knex(TableName.Project).whereIn("id", processedIds).update("defaultProduct", null);
        }
      }
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTypeColumn = await knex.schema.hasColumn(TableName.Project, "type");
  const hasDefaultTypeColumn = await knex.schema.hasColumn(TableName.Project, "defaultProduct");
  if (hasTypeColumn && hasDefaultTypeColumn) {
    await knex(TableName.Project).update({
      // eslint-disable-next-line
      // @ts-ignore this is because this field is created later
      defaultProduct: knex.raw(`
    CASE 
      WHEN "type" IS NULL OR "type" = '' THEN 'secret-manager' 
      ELSE "type" 
    END
  `)
    });

    await knex.schema.alterTable(TableName.Project, (t) => {
      t.string("type").nullable().alter();
      t.string("defaultProduct").notNullable().alter();
    });
  }

  const hasTemplateTypeColumn = await knex.schema.hasColumn(TableName.ProjectTemplates, "type");
  if (hasTemplateTypeColumn) {
    await knex.schema.alterTable(TableName.ProjectTemplates, (t) => {
      t.string("type").nullable().alter();
    });
  }
}
