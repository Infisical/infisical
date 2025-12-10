import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";

import { PamAccountOrderBy } from "../pam-account/pam-account-enums";

export type TPamFolderDALFactory = ReturnType<typeof pamFolderDALFactory>;
export const pamFolderDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamFolder);

  const findByProjectId = async (
    {
      projectId,
      parentId,
      search,
      limit,
      offset = 0,
      orderBy = PamAccountOrderBy.Name,
      orderDirection = OrderByDirection.ASC
    }: {
      projectId: string;
      parentId?: string | null;
      search?: string;
      limit?: number;
      offset?: number;
      orderBy?: PamAccountOrderBy;
      orderDirection?: OrderByDirection;
    },
    tx?: Knex
  ) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const query = dbInstance(TableName.PamFolder).where(`${TableName.PamFolder}.projectId`, projectId);

      if (parentId) {
        void query.where(`${TableName.PamFolder}.parentId`, parentId);
      } else {
        void query.whereNull(`${TableName.PamFolder}.parentId`);
      }

      if (search) {
        // escape special characters (`%`, `_`) and the escape character itself (`\`)
        const escapedSearch = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
        void query.whereRaw(`??.?? ILIKE ? ESCAPE '\\'`, [TableName.PamFolder, "name", `%${escapedSearch}%`]);
      }

      const countQuery = query.clone().count("*", { as: "count" }).first();

      void query.select(selectAllTableCols(TableName.PamFolder));
      const direction = orderDirection === OrderByDirection.ASC ? "ASC" : "DESC";

      void query.orderByRaw(`${TableName.PamFolder}.?? COLLATE "en-x-icu" ${direction}`, [orderBy]);

      if (typeof limit === "number") {
        void query.limit(limit).offset(offset);
      }

      const [folders, countResult] = await Promise.all([query, countQuery]);
      const totalCount = Number(countResult?.count || 0);

      return { folders, totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM folders" });
    }
  };

  const findByPath = async (projectId: string, path: string, tx?: Knex) => {
    try {
      const dbInstance = tx || db.replicaNode();

      const folders = await dbInstance(TableName.PamFolder)
        .where(`${TableName.PamFolder}.projectId`, projectId)
        .select(selectAllTableCols(TableName.PamFolder));

      const pathSegments = path.split("/").filter(Boolean);
      if (pathSegments.length === 0) {
        return undefined;
      }

      const foldersByParentId = new Map<string | null, typeof folders>();
      for (const folder of folders) {
        const children = foldersByParentId.get(folder.parentId ?? null) ?? [];
        children.push(folder);
        foldersByParentId.set(folder.parentId ?? null, children);
      }

      let parentId: string | null = null;
      let currentFolder: (typeof folders)[0] | undefined;

      for (const segment of pathSegments) {
        const childFolders: typeof folders = foldersByParentId.get(parentId) || [];
        currentFolder = childFolders.find((folder) => folder.name === segment);

        if (!currentFolder) {
          return undefined;
        }

        parentId = currentFolder.id;
      }

      return currentFolder;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM folder by path" });
    }
  };

  return { ...orm, findByProjectId, findByPath };
};
