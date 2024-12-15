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
    // @ts-ignore id is required
    id: newProjectId,
    slug: slugify(`${project?.name}-${alphaNumericNanoId(4)}`)
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

  return newProjectId;
};

const BATCH_SIZE = 500;
export async function up(knex: Knex): Promise<void> {
  const hasSplitMappingTable = await knex.schema.hasTable(TableName.ProjectSplitBackfillIds);
  if (!hasSplitMappingTable) {
    await knex.schema.createTable(TableName.ProjectSplitBackfillIds, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("sourceProjectId", 36).notNullable();
      t.foreign("sourceProjectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("destinationProjectType").notNullable();
      t.string("destinationProjectId", 36).notNullable();
      t.foreign("destinationProjectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    });
  }

  const hasTypeColumn = await knex.schema.hasColumn(TableName.Project, "type");
  if (!hasTypeColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.string("type");
    });

    let projectsToBeTyped;
    do {
      // eslint-disable-next-line no-await-in-loop
      projectsToBeTyped = await knex(TableName.Project).whereNull("type").limit(BATCH_SIZE).select("id");
      if (projectsToBeTyped.length) {
        // eslint-disable-next-line no-await-in-loop
        await knex(TableName.Project)
          .whereIn(
            "id",
            projectsToBeTyped.map((el) => el.id)
          )
          .update({ type: ProjectType.SecretManager });
      }
    } while (projectsToBeTyped.length > 0);

    const projectsWithCertificates = await knex(TableName.CertificateAuthority)
      .distinct("projectId")
      .select("projectId");
    /* eslint-disable no-await-in-loop,no-param-reassign */
    for (const { projectId } of projectsWithCertificates) {
      const newProjectId = await newProject(knex, projectId, ProjectType.CertificateManager);
      await knex(TableName.CertificateAuthority).where("projectId", projectId).update({ projectId: newProjectId });
      await knex(TableName.PkiAlert).where("projectId", projectId).update({ projectId: newProjectId });
      await knex(TableName.PkiCollection).where("projectId", projectId).update({ projectId: newProjectId });
      await knex(TableName.ProjectSplitBackfillIds).insert({
        sourceProjectId: projectId,
        destinationProjectType: ProjectType.CertificateManager,
        destinationProjectId: newProjectId
      });
    }

    const projectsWithCmek = await knex(TableName.KmsKey)
      .where("isReserved", false)
      .whereNotNull("projectId")
      .distinct("projectId")
      .select("projectId");
    for (const { projectId } of projectsWithCmek) {
      if (projectId) {
        const newProjectId = await newProject(knex, projectId, ProjectType.KMS);
        await knex(TableName.KmsKey)
          .where({
            isReserved: false,
            projectId
          })
          .update({ projectId: newProjectId });
        await knex(TableName.ProjectSplitBackfillIds).insert({
          sourceProjectId: projectId,
          destinationProjectType: ProjectType.KMS,
          destinationProjectId: newProjectId
        });
      }
    }

    /* eslint-enable */
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.string("type").notNullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTypeColumn = await knex.schema.hasColumn(TableName.Project, "type");
  const hasSplitMappingTable = await knex.schema.hasTable(TableName.ProjectSplitBackfillIds);

  if (hasTypeColumn && hasSplitMappingTable) {
    const splitProjectMappings = await knex(TableName.ProjectSplitBackfillIds).where({});
    const certMapping = splitProjectMappings.filter(
      (el) => el.destinationProjectType === ProjectType.CertificateManager
    );
    /* eslint-disable no-await-in-loop */
    for (const project of certMapping) {
      await knex(TableName.CertificateAuthority)
        .where("projectId", project.destinationProjectId)
        .update({ projectId: project.sourceProjectId });
      await knex(TableName.PkiAlert)
        .where("projectId", project.destinationProjectId)
        .update({ projectId: project.sourceProjectId });
      await knex(TableName.PkiCollection)
        .where("projectId", project.destinationProjectId)
        .update({ projectId: project.sourceProjectId });
    }

    /* eslint-enable */
    const kmsMapping = splitProjectMappings.filter((el) => el.destinationProjectType === ProjectType.KMS);
    /* eslint-disable no-await-in-loop */
    for (const project of kmsMapping) {
      await knex(TableName.KmsKey)
        .where({
          isReserved: false,
          projectId: project.destinationProjectId
        })
        .update({ projectId: project.sourceProjectId });
    }
    /* eslint-enable */
    await knex(TableName.ProjectMembership)
      .whereIn(
        "projectId",
        splitProjectMappings.map((el) => el.destinationProjectId)
      )
      .delete();
    await knex(TableName.ProjectRoles)
      .whereIn(
        "projectId",
        splitProjectMappings.map((el) => el.destinationProjectId)
      )
      .delete();
    await knex(TableName.Project)
      .whereIn(
        "id",
        splitProjectMappings.map((el) => el.destinationProjectId)
      )
      .delete();

    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("type");
    });
  }

  if (hasSplitMappingTable) {
    await knex.schema.dropTableIfExists(TableName.ProjectSplitBackfillIds);
  }
}
