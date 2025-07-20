import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";
import { v4 as uuidV4 } from "uuid";

import { alphaNumericNanoId } from "@app/lib/nanoid";

import { ProjectType, TableName } from "../schemas";

/* eslint-disable no-await-in-loop,@typescript-eslint/ban-ts-comment */
const newProject = async (knex: Knex, projectId: string, projectType: ProjectType) => {
  const newProjectId = uuidV4();
  const project = await knex(TableName.Project).where("id", projectId).first();
  await knex(TableName.Project).insert({
    ...project,
    type: projectType,
    defaultProduct: projectType,
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
  const secret = await knex(TableName.Secret)
    .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.Secret}.folderId`)
    .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
    .where("projectId", oldProjectId)
    .returning(`${TableName.Secret}.id`)
    .first();
  if (secret) {
    const newProjectId = await newProject(knex, oldProjectId, ProjectType.SecretManager);
    await knex(TableName.IntegrationAuth).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.SecretBlindIndex).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.SecretSync).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.SecretTag).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.SecretReminderRecipients).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.ServiceToken).where("projectId", oldProjectId).update("projectId", newProjectId);
  }
};

const kickOutCertManagerProject = async (knex: Knex, oldProjectId: string) => {
  const cas = await knex(TableName.CertificateAuthority).where("projectId", oldProjectId).returning("id").first();
  if (cas) {
    const newProjectId = await newProject(knex, oldProjectId, ProjectType.CertificateManager);
    await knex(TableName.CertificateAuthority).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.Certificate).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.PkiSubscriber).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.PkiCollection).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.PkiAlert).where("projectId", oldProjectId).update("projectId", newProjectId);
  }
};

const kickOutSecretScanningProject = async (knex: Knex, oldProjectId: string) => {
  const cas = await knex(TableName.SecretScanningConfig).where("projectId", oldProjectId).returning("id").first();
  if (cas) {
    const newProjectId = await newProject(knex, oldProjectId, ProjectType.SecretScanning);
    await knex(TableName.SecretScanningConfig).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.SecretScanningDataSource).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.SecretScanningFinding).where("projectId", oldProjectId).update("projectId", newProjectId);
  }
};

const kickOutKmsProject = async (knex: Knex, oldProjectId: string) => {
  const kmsKeys = await knex(TableName.KmsKey)
    .where("projectId", oldProjectId)
    .andWhere("isReserved", false)
    .returning("id")
    .first();
  if (kmsKeys) {
    const newProjectId = await newProject(knex, oldProjectId, ProjectType.KMS);
    await knex(TableName.KmsKey)
      .where("projectId", oldProjectId)
      .andWhere("isReserved", false)
      .update("projectId", newProjectId);
    await knex(TableName.KmipClient).where("projectId", oldProjectId).update("projectId", newProjectId);
  }
};

const kickOutSshProject = async (knex: Knex, oldProjectId: string) => {
  const hosts = await knex(TableName.ProjectSshConfig).where("projectId", oldProjectId).returning("id").first();
  if (hosts) {
    const newProjectId = await newProject(knex, oldProjectId, ProjectType.SSH);
    await knex(TableName.SshHost).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.ProjectSshConfig).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.SshCertificateAuthority).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.SecretScanningFinding).where("projectId", oldProjectId).update("projectId", newProjectId);
    await knex(TableName.SshHostGroup).where("projectId", oldProjectId).update("projectId", newProjectId);
  }
};

const BATCH_SIZE = 1000;
export async function up(knex: Knex): Promise<void> {
  const hasTemplateTypeColumn = await knex.schema.hasColumn(TableName.ProjectTemplates, "type");
  if (hasTemplateTypeColumn) {
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

    let projectsToBeSplit;
    do {
      // eslint-disable-next-line no-await-in-loop
      projectsToBeSplit = await knex(TableName.Project)
        .whereNotNull("defaultProduct")
        .limit(BATCH_SIZE)
        .select("id", "defaultProduct");
      if (projectsToBeSplit.length) {
        const ids: string[] = [];
        for (const { id, defaultProduct } of projectsToBeSplit) {
          if (defaultProduct !== ProjectType.SecretManager) await kickOutSecretManagerProject(knex, id);
          if (defaultProduct !== ProjectType.CertificateManager) await kickOutCertManagerProject(knex, id);
          if (defaultProduct !== ProjectType.KMS) await kickOutKmsProject(knex, id);
          if (defaultProduct !== ProjectType.SSH) await kickOutSshProject(knex, id);
          if (defaultProduct !== ProjectType.SecretScanning) await kickOutSecretScanningProject(knex, id);
          ids.push(id);
        }
        await knex(TableName.Project).whereIn("id", ids).update("defaultProduct", null);
      }
    } while (projectsToBeSplit.length > 0);
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
