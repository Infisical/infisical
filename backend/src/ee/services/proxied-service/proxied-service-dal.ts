import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TProxiedServices } from "@app/db/schemas";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";

export type TProxiedServiceDALFactory = ReturnType<typeof proxiedServiceDALFactory>;

export const proxiedServiceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ProxiedService);

  const findByProjectId = async (
    {
      projectId,
      search,
      limit,
      offset = 0,
      orderDirection = OrderByDirection.ASC
    }: {
      projectId: string;
      search?: string;
      limit?: number;
      offset?: number;
      orderDirection?: OrderByDirection;
    },
    tx?: Knex
  ): Promise<TProxiedServices[]> => {
    const query = (tx || db.replicaNode())(TableName.ProxiedService)
      .where(`${TableName.ProxiedService}.projectId`, projectId)
      .where((bd) => {
        if (search) {
          void bd.whereILike(`${TableName.ProxiedService}.name`, `%${sanitizeSqlLikeString(search)}%`);
        }
      })
      .select(selectAllTableCols(TableName.ProxiedService))
      .orderBy(`${TableName.ProxiedService}.name`, orderDirection);

    if (limit) {
      void query.limit(limit).offset(offset);
    }

    return query;
  };

  const countByProjectId = async ({ projectId, search }: { projectId: string; search?: string }, tx?: Knex) => {
    const query = (tx || db.replicaNode())(TableName.ProxiedService).where(
      `${TableName.ProxiedService}.projectId`,
      projectId
    );

    if (search) {
      void query.whereILike(`${TableName.ProxiedService}.name`, `%${sanitizeSqlLikeString(search)}%`);
    }

    const [result] = await query.count<{ count: string | number }[]>(`${TableName.ProxiedService}.id`);
    return Number(result?.count ?? 0);
  };

  const stampLastUsed = async (serviceId: string, tx?: Knex) => {
    await (tx || db)(TableName.ProxiedService)
      .where({ id: serviceId })
      .update({ lastUsedAt: db.fn.now() as unknown as Date });
  };

  return {
    ...orm,
    findByProjectId,
    countByProjectId,
    stampLastUsed
  };
};
