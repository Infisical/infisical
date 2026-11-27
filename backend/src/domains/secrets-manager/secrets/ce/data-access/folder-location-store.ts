import { TableName, TSecretFolders } from "@app/db/schemas";
import { TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";

import { TFolderLocation, TFolderLocationStore } from "../services/dependencies";

const MAX_FOLDER_DEPTH = 20;

type TFolderRow = Pick<TSecretFolders, "id" | "name" | "envId" | "parentId">;

// Path from the env root ("/" for the root itself). A folder with a missing parent goes under the root.
const folderPath = (folder: TFolderRow, byId: Map<string, TFolderRow>, depth = 0): string => {
  if (depth > MAX_FOLDER_DEPTH) throw new Error(`Maximum folder depth of ${MAX_FOLDER_DEPTH} exceeded`);
  if (!folder.parentId) return depth === 0 ? "/" : "";
  const parent = byId.get(folder.parentId);
  if (!parent) return `/${folder.name}`;
  return `${folderPath(parent, byId, depth + 1)}/${folder.name}`;
};

// Reads secret_folders and project_environments, which no domain owns yet (declared exception, see ../../AGENTS.md).
export class FolderLocationStore implements TFolderLocationStore {
  constructor(private readonly connection: TStoreConnection) {}

  async findLocations(
    projectId: string,
    folderIds: string[],
    options?: TReadOptions
  ): Promise<(TFolderLocation | null)[]> {
    if (!folderIds.length) return [];
    try {
      const knex = this.connection.reader(options);
      const liveEnvironmentIds = knex(TableName.SecretFolder)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .whereIn(`${TableName.SecretFolder}.id`, folderIds)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .select(`${TableName.SecretFolder}.envId`);
      const [environments, folders] = await Promise.all([
        knex(TableName.Environment).whereIn("id", liveEnvironmentIds).select("id", "slug"),
        knex(TableName.SecretFolder)
          .whereIn("envId", liveEnvironmentIds.clone())
          .select("id", "name", "envId", "parentId")
      ]);
      const slugByEnvironmentId = new Map(environments.map((env) => [env.id, env.slug]));
      const folderById = new Map<string, TFolderRow>(folders.map((folder) => [folder.id, folder]));
      return folderIds.map((folderId) => {
        const folder = folderById.get(folderId);
        const environmentSlug = folder && slugByEnvironmentId.get(folder.envId);
        if (!folder || !environmentSlug) return null;
        return { environmentSlug, secretPath: folderPath(folder, folderById) };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find folder locations" });
    }
  }
}
