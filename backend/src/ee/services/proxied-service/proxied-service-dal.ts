import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { ormify } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";

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

const scopedSelectColumns = (db: TDbClient) => [
  db.ref("id").withSchema(TableName.ProxiedService),
  db.ref("name").withSchema(TableName.ProxiedService),
  db.ref("hostPattern").withSchema(TableName.ProxiedService),
  db.ref("isEnabled").withSchema(TableName.ProxiedService),
  db.ref("folderId").withSchema(TableName.ProxiedService),
  db.ref("createdAt").withSchema(TableName.ProxiedService),
  db.ref("updatedAt").withSchema(TableName.ProxiedService),
  db.ref("projectId").withSchema(TableName.Environment).as("projectId"),
  db.ref("id").withSchema(TableName.Environment).as("envId"),
  db.ref("name").withSchema(TableName.Environment).as("envName"),
  db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
  db.ref("name").withSchema(TableName.SecretFolder).as("folderName")
];

type TScopedRow = {
  id: string;
  name: string;
  hostPattern: string;
  isEnabled: boolean;
  folderId: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  envId: string;
  envName: string;
  envSlug: string;
  folderName: string;
};

const mapRowToScope = (row: TScopedRow): TProxiedServiceWithScope => ({
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
  // folder's own name, not its full path; callers surfacing this must override with the canonical secret path
  folder: {
    path: row.folderName
  }
});

export const proxiedServiceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ProxiedService);

  const findByFolderIds = async (folderIds: string[], tx?: Knex): Promise<TProxiedServiceWithScope[]> => {
    if (!folderIds.length) return [];
    const rows = await (tx || db.replicaNode())(TableName.ProxiedService)
      .whereIn(`${TableName.ProxiedService}.folderId`, folderIds)
      .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.ProxiedService}.folderId`)
      .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
      .whereNull(`${TableName.Environment}.deleteAfter`)
      .select(scopedSelectColumns(db));

    return rows.map(mapRowToScope);
  };

  const findDashboardByFolderIds = async (
    {
      folderIds,
      search,
      limit,
      offset = 0,
      orderDirection = OrderByDirection.ASC
    }: {
      folderIds: string[];
      search?: string;
      limit?: number;
      offset?: number;
      orderDirection?: OrderByDirection;
    },
    tx?: Knex
  ): Promise<TProxiedServiceWithScope[]> => {
    if (!folderIds.length) return [];

    const query = (tx || db.replicaNode())(TableName.ProxiedService)
      .whereIn(`${TableName.ProxiedService}.folderId`, folderIds)
      .where((bd) => {
        if (search) {
          void bd.whereILike(`${TableName.ProxiedService}.name`, `%${sanitizeSqlLikeString(search)}%`);
        }
      })
      .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.ProxiedService}.folderId`)
      .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
      .whereNull(`${TableName.Environment}.deleteAfter`)
      .select(
        ...scopedSelectColumns(db),
        // orderDirection is a constrained enum (asc|desc), safe to interpolate
        db.raw(`DENSE_RANK() OVER (ORDER BY ${TableName.ProxiedService}."name" ${orderDirection}) as rank`)
      )
      .orderBy(`${TableName.ProxiedService}.name`, orderDirection);

    let rows: TScopedRow[];
    if (limit) {
      const rankOffset = offset + 1;
      rows = await (tx || db.replicaNode())
        .with("w", query)
        .select("*")
        .from<TScopedRow>("w")
        .where("w.rank", ">=", rankOffset)
        .andWhere("w.rank", "<", rankOffset + limit);
    } else {
      rows = await query;
    }

    return rows.map(mapRowToScope);
  };

  const countByFolderIds = async (folderIds: string[], search?: string, tx?: Knex) => {
    if (!folderIds.length) return 0;
    const query = (tx || db.replicaNode())(TableName.ProxiedService).whereIn(
      `${TableName.ProxiedService}.folderId`,
      folderIds
    );

    if (search) {
      void query.whereILike(`${TableName.ProxiedService}.name`, `%${sanitizeSqlLikeString(search)}%`);
    }

    const [result] = await query.countDistinct<{ count: string | number }>({
      count: `${TableName.ProxiedService}.name`
    });
    return Number(result?.count ?? 0);
  };

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
    findDashboardByFolderIds,
    countByFolderIds,
    findByIdWithScope
  };
};
