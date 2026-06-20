import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPamFolders } from "@app/db/schemas";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { ormify } from "@app/lib/knex";

import { accountAccessibilitySql } from "../pam-account/pam-account-dal";

export type TPamFolderWithCount = TPamFolders & { accountCount: number };

export type TPamFolderDALFactory = ReturnType<typeof pamFolderDALFactory>;

export const pamFolderDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamFolder);

  const findByProjectIdFiltered = async (
    projectId: string,
    folderIds: string[],
    filters?: { search?: string; accountIds?: string[]; onlyAccessible?: boolean },
    tx?: Knex
  ): Promise<TPamFolderWithCount[]> => {
    const qb = (tx || db.replicaNode())(TableName.PamFolder)
      .leftJoin(TableName.PamAccount, `${TableName.PamAccount}.folderId`, `${TableName.PamFolder}.id`)
      .leftJoin(
        TableName.PamAccountTemplate,
        `${TableName.PamAccount}.templateId`,
        `${TableName.PamAccountTemplate}.id`
      )
      .where(`${TableName.PamFolder}.projectId`, projectId)
      .where((builder) => {
        if (folderIds.length > 0) {
          void builder.whereIn(`${TableName.PamFolder}.id`, folderIds);
        }
        if (filters?.accountIds && filters.accountIds.length > 0) {
          void builder.orWhereIn(`${TableName.PamAccount}.id`, filters.accountIds);
        }
      });

    if (filters?.search) {
      void qb.whereILike(`${TableName.PamFolder}.name`, `%${sanitizeSqlLikeString(filters.search)}%`);
    }

    const countExpr = filters?.onlyAccessible
      ? `COUNT(${TableName.PamAccount}.id) FILTER (WHERE ${accountAccessibilitySql(
          TableName.PamAccount,
          TableName.PamAccountTemplate
        )})::int as "accountCount"`
      : `COUNT(${TableName.PamAccount}.id)::int as "accountCount"`;

    return qb
      .groupBy(`${TableName.PamFolder}.id`)
      .select(`${TableName.PamFolder}.*`, db.raw(countExpr))
      .orderBy(`${TableName.PamFolder}.name`, "asc") as unknown as Promise<TPamFolderWithCount[]>;
  };

  const countAccountsByFolderId = async (folderId: string, tx?: Knex) => {
    const [result] = (await (tx || db)(TableName.PamAccount).where({ folderId }).count("id as count")) as unknown as [
      { count: string }
    ];
    return Number(result.count);
  };

  return { ...orm, findByProjectIdFiltered, countAccountsByFolderId };
};
