import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPamAccountTemplates } from "@app/db/schemas";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { ormify } from "@app/lib/knex";

import { PamAccountType } from "../pam/pam-enums";

export type TPamAccountTemplateWithCount = TPamAccountTemplates & { accountCount: number };

export type TPamAccountTemplateDALFactory = ReturnType<typeof pamAccountTemplateDALFactory>;

export const pamAccountTemplateDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamAccountTemplate);

  const findByProjectId = async (
    projectId: string,
    filters?: { search?: string; type?: PamAccountType },
    tx?: Knex
  ): Promise<TPamAccountTemplateWithCount[]> => {
    const qb = (tx || db.replicaNode())(TableName.PamAccountTemplate)
      .leftJoin(TableName.PamAccount, `${TableName.PamAccount}.templateId`, `${TableName.PamAccountTemplate}.id`)
      .where(`${TableName.PamAccountTemplate}.projectId`, projectId);

    if (filters?.search) {
      const sanitized = sanitizeSqlLikeString(filters.search);
      void qb.where((inner) => {
        void inner
          .whereILike(`${TableName.PamAccountTemplate}.name`, `%${sanitized}%`)
          .orWhereILike(`${TableName.PamAccountTemplate}.type`, `%${sanitized}%`);
      });
    }
    if (filters?.type) {
      void qb.where(`${TableName.PamAccountTemplate}.type`, filters.type);
    }

    return qb
      .groupBy(`${TableName.PamAccountTemplate}.id`)
      .select(`${TableName.PamAccountTemplate}.*`, db.raw(`COUNT(${TableName.PamAccount}.id)::int as "accountCount"`))
      .orderBy(`${TableName.PamAccountTemplate}.name`, "asc") as unknown as Promise<TPamAccountTemplateWithCount[]>;
  };

  const countAccountsByTemplateId = async (templateId: string, tx?: Knex) => {
    const [result] = (await (tx || db.replicaNode())(TableName.PamAccount)
      .where({ templateId })
      .count("id as count")) as unknown as [{ count: string }];
    return Number(result.count);
  };

  return { ...orm, findByProjectId, countAccountsByTemplateId };
};
