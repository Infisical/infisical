import { TableName } from "@app/db/schemas";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import { DatabaseError } from "@app/lib/errors";
import { buildFolderIdMap, buildFolderPath } from "@app/services/secret-folder/secret-folder-fns";

export type TFolderLocation = { environmentSlug: string; path: string };

// Reads secret_folders and project_environments, which belong to Secret Manager but are not in this domain yet: a
// declared exception (see ../../AGENTS.md).
export class FolderPathDataAccess {
  constructor(private readonly db: DataAccessDb) {}

  // Each folder's environment and full path, in the order asked; undefined for a folder that is gone or whose
  // environment is being deleted.
  async findLocations(projectId: string, folderIds: string[]): Promise<(TFolderLocation | undefined)[]> {
    if (!folderIds.length) return [];
    try {
      const knex = this.db.reader();
      const envIds = knex(TableName.SecretFolder)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .whereIn(`${TableName.SecretFolder}.id`, folderIds)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .select(`${TableName.SecretFolder}.envId`);
      const [environments, folders] = await Promise.all([
        knex(TableName.Environment).whereIn("id", envIds).select("id", "slug"),
        knex(TableName.SecretFolder).whereIn("envId", envIds).select("*")
      ]);
      const slugByEnvId = new Map(environments.map((env) => [env.id as string, env.slug as string]));
      const folderById = buildFolderIdMap(folders);
      return folderIds.map((folderId) => {
        const folder = folderById[folderId];
        const environmentSlug = folder && slugByEnvId.get(folder.envId);
        return folder && environmentSlug ? { environmentSlug, path: buildFolderPath(folder, folderById) } : undefined;
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find folder locations" });
    }
  }
}
