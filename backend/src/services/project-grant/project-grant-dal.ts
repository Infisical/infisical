import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TProjectGrantDALFactory = ReturnType<typeof projectGrantDALFactory>;

export const projectGrantDALFactory = (db: TDbClient) => {
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

    return rows as (typeof rows[number] & {
      folderName: string;
      environmentName: string;
      environmentSlug: string;
      targetProjectName: string;
      secretCount: number;
    })[];
  };

  return { ...orm, listBySourceProject };
};
