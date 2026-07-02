import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TProjectFolderGrants } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TProjectFolderGrantDALFactory = ReturnType<typeof projectFolderGrantDALFactory>;

export const projectFolderGrantDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ProjectFolderGrant);

  const listBySourceProject = async (sourceProjectId: string, tx?: Knex) => {
    const rows = await (tx || db.replicaNode())(TableName.ProjectFolderGrant)
      .where(`${TableName.ProjectFolderGrant}.sourceProjectId`, sourceProjectId)
      .join(TableName.SecretFolder, `${TableName.ProjectFolderGrant}.sourceFolderId`, `${TableName.SecretFolder}.id`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .join(
        `${TableName.Project} as targetProject`,
        `${TableName.ProjectFolderGrant}.targetProjectId`,
        `targetProject.id`
      )
      .select(
        `${TableName.ProjectFolderGrant}.*`,
        `${TableName.SecretFolder}.name as folderName`,
        `${TableName.Environment}.name as environmentName`,
        `${TableName.Environment}.slug as environmentSlug`,
        `targetProject.name as targetProjectName`,
        db.raw(
          `(SELECT COUNT(*)::integer FROM "${TableName.SecretV2}" WHERE "folderId" = "${TableName.ProjectFolderGrant}"."sourceFolderId" AND "type" = 'shared') as "secretCount"`
        )
      );

    return rows as unknown[] as (TProjectFolderGrants & {
      folderName: string;
      environmentName: string;
      environmentSlug: string;
      targetProjectName: string;
      secretCount: number;
    })[];
  };

  const listByTargetProject = async (targetProjectId: string, tx?: Knex) => {
    const rows = await (tx || db.replicaNode())(TableName.ProjectFolderGrant)
      .where(`${TableName.ProjectFolderGrant}.targetProjectId`, targetProjectId)
      .join(TableName.SecretFolder, `${TableName.ProjectFolderGrant}.sourceFolderId`, `${TableName.SecretFolder}.id`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .join(
        `${TableName.Project} as sourceProject`,
        `${TableName.ProjectFolderGrant}.sourceProjectId`,
        `sourceProject.id`
      )
      .select(
        `${TableName.ProjectFolderGrant}.*`,
        `${TableName.SecretFolder}.name as folderName`,
        `${TableName.Environment}.name as environmentName`,
        `${TableName.Environment}.slug as environmentSlug`,
        `sourceProject.name as sourceProjectName`,
        `sourceProject.slug as sourceProjectSlug`,
        db.raw(
          `(SELECT COUNT(*)::integer FROM "${TableName.SecretV2}" WHERE "folderId" = "${TableName.ProjectFolderGrant}"."sourceFolderId" AND "type" = 'shared') as "secretCount"`
        )
      );

    return rows as unknown[] as (TProjectFolderGrants & {
      folderName: string;
      environmentName: string;
      environmentSlug: string;
      sourceProjectName: string;
      sourceProjectSlug: string;
      secretCount: number;
    })[];
  };

  const countUsageByGrant = async (
    {
      targetProjectId,
      sourceEnvId,
      sourcePath,
      sourceProjectSlug,
      sourceEnvSlug
    }: {
      targetProjectId: string;
      sourceEnvId: string;
      sourcePath: string;
      sourceProjectSlug: string;
      sourceEnvSlug: string;
    },
    tx?: Knex
  ) => {
    try {
      const importResult = await (tx || db.replicaNode())(TableName.SecretImport)
        .join(TableName.SecretFolder, `${TableName.SecretImport}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .where(`${TableName.Environment}.projectId`, targetProjectId)
        .where(`${TableName.SecretImport}.importEnv`, sourceEnvId)
        .where(`${TableName.SecretImport}.importPath`, sourcePath)
        .count();

      const referenceResult = await (tx || db.replicaNode())(TableName.SecretReferenceV2)
        .join(TableName.SecretV2, `${TableName.SecretReferenceV2}.secretId`, `${TableName.SecretV2}.id`)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .where(`${TableName.Environment}.projectId`, targetProjectId)
        .where(`${TableName.SecretReferenceV2}.targetProjectSlug`, sourceProjectSlug)
        .where(`${TableName.SecretReferenceV2}.environment`, sourceEnvSlug)
        .where(`${TableName.SecretReferenceV2}.secretPath`, sourcePath)
        .count();

      return {
        importCount: Number(importResult[0]?.count ?? 0),
        referenceCount: Number(referenceResult[0]?.count ?? 0)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Count grant usage" });
    }
  };

  return { ...orm, listBySourceProject, listByTargetProject, countUsageByGrant };
};
