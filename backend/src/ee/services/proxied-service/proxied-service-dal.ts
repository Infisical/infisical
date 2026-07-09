import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TProxiedServiceDALFactory = ReturnType<typeof proxiedServiceDALFactory>;

export type TProxiedServiceWithScope = {
  id: string;
  name: string;
  hostPattern: string;
  isEnabled: boolean;
  folderId: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  environment: { id: string; name: string; slug: string };
  folder: { path: string };
};

export type TProxiedServiceScoped = {
  id: string;
  name: string;
  hostPattern: string;
  isEnabled: boolean;
  folderId: string;
  projectId: string;
  environmentSlug: string;
  createdAt: Date;
  updatedAt: Date;
};

export const proxiedServiceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ProxiedService);

  // proxied_services has no projectId column; it is derived via folder -> environment -> project.
  const findByFolderIds = async (folderIds: string[], tx?: Knex): Promise<TProxiedServiceWithScope[]> => {
    if (!folderIds.length) return [];
    const rows = await (tx || db.replicaNode())(TableName.ProxiedService)
      .whereIn(`${TableName.ProxiedService}.folderId`, folderIds)
      .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.ProxiedService}.folderId`)
      .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
      .whereNull(`${TableName.Environment}.deleteAfter`)
      .select(
        db.ref("id").withSchema(TableName.ProxiedService),
        db.ref("name").withSchema(TableName.ProxiedService),
        db.ref("hostPattern").withSchema(TableName.ProxiedService),
        db.ref("isEnabled").withSchema(TableName.ProxiedService),
        db.ref("folderId").withSchema(TableName.ProxiedService),
        db.ref("createdAt").withSchema(TableName.ProxiedService),
        db.ref("updatedAt").withSchema(TableName.ProxiedService)
      )
      .select(
        db.ref("projectId").withSchema(TableName.Environment).as("projectId"),
        db.ref("id").withSchema(TableName.Environment).as("envId"),
        db.ref("name").withSchema(TableName.Environment).as("envName"),
        db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
        db.ref("name").withSchema(TableName.SecretFolder).as("folderName")
      );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      hostPattern: row.hostPattern,
      isEnabled: row.isEnabled,
      folderId: row.folderId,
      projectId: row.projectId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      environment: {
        id: row.envId,
        name: row.envName,
        slug: row.envSlug
      },
      // NOTE: this is the folder's own name, not its full path. Callers that surface this to clients
      // (e.g. the dashboard aggregate) must override it with the canonical secret path.
      folder: {
        path: row.folderName
      }
    }));
  };

  const countByFolderIds = async (folderIds: string[], search?: string, tx?: Knex) => {
    if (!folderIds.length) return 0;
    const query = (tx || db.replicaNode())(TableName.ProxiedService).whereIn(
      `${TableName.ProxiedService}.folderId`,
      folderIds
    );

    if (search) {
      void query.where(`${TableName.ProxiedService}.name`, "ilike", `%${search}%`);
    }

    const [result] = await query.countDistinct<{ count: string | number }>({
      count: `${TableName.ProxiedService}.name`
    });
    return Number(result?.count ?? 0);
  };

  // Loads a service by id together with its derived project id and environment slug for scoped permission checks.
  const findByIdWithScope = async (serviceId: string, tx?: Knex): Promise<TProxiedServiceScoped | null> => {
    const row = await (tx || db.replicaNode())(TableName.ProxiedService)
      .where(`${TableName.ProxiedService}.id`, serviceId)
      .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.ProxiedService}.folderId`)
      .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
      .whereNull(`${TableName.Environment}.deleteAfter`)
      .select(
        db.ref("id").withSchema(TableName.ProxiedService),
        db.ref("name").withSchema(TableName.ProxiedService),
        db.ref("hostPattern").withSchema(TableName.ProxiedService),
        db.ref("isEnabled").withSchema(TableName.ProxiedService),
        db.ref("folderId").withSchema(TableName.ProxiedService),
        db.ref("createdAt").withSchema(TableName.ProxiedService),
        db.ref("updatedAt").withSchema(TableName.ProxiedService)
      )
      .select(
        db.ref("projectId").withSchema(TableName.Environment).as("projectId"),
        db.ref("slug").withSchema(TableName.Environment).as("envSlug")
      )
      .first();

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      hostPattern: row.hostPattern,
      isEnabled: row.isEnabled,
      folderId: row.folderId,
      projectId: row.projectId,
      environmentSlug: row.envSlug,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  };

  return {
    ...orm,
    findByFolderIds,
    countByFolderIds,
    findByIdWithScope
  };
};
