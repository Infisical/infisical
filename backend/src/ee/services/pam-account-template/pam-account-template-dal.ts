import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { ormify } from "@app/lib/knex";

import { PamAccountType } from "../pam/pam-enums";

export type TPamAccountTemplateDALFactory = ReturnType<typeof pamAccountTemplateDALFactory>;

export const pamAccountTemplateDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamAccountTemplate);

  const findByProjectId = async (
    projectId: string,
    filters?: { search?: string; type?: PamAccountType },
    tx?: Knex
  ) => {
    const qb = (tx || db.replicaNode())(TableName.PamAccountTemplate).where({ projectId });

    if (filters?.search) {
      const sanitized = sanitizeSqlLikeString(filters.search);
      void qb.where((inner) => {
        void inner.whereILike("name", `%${sanitized}%`).orWhereILike("type", `%${sanitized}%`);
      });
    }
    if (filters?.type) {
      void qb.where("type", filters.type);
    }

    return qb.orderBy("name", "asc");
  };

  const countAccountsByTemplateId = async (templateId: string, tx?: Knex) => {
    const [result] = (await (tx || db.replicaNode())(TableName.PamAccount)
      .where({ templateId })
      .count("id as count")) as unknown as [{ count: string }];
    return Number(result.count);
  };

  return { ...orm, findByProjectId, countAccountsByTemplateId };
};
