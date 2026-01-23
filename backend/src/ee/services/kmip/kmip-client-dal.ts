import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TKmipClients } from "@app/db/schemas/kmip-clients";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";

import { KmipClientOrderBy } from "./kmip-types";

export type TKmipClientDALFactory = ReturnType<typeof kmipClientDALFactory>;

export const kmipClientDALFactory = (db: TDbClient) => {
  const kmipClientOrm = ormify(db, TableName.KmipClient);

  const findByProjectAndClientId = async (projectId: string, clientId: string) => {
    try {
      const client = await db
        .replicaNode()(TableName.KmipClient)
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.KmipClient}.projectId`)
        .join(TableName.Organization, `${TableName.Organization}.id`, `${TableName.Project}.orgId`)
        .where({
          [`${TableName.KmipClient}.projectId` as "projectId"]: projectId,
          [`${TableName.KmipClient}.id` as "id"]: clientId
        })
        .select(selectAllTableCols(TableName.KmipClient))
        .select(db.ref("id").withSchema(TableName.Organization).as("orgId"))
        .first();

      return client;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by project and client ID" });
    }
  };

  const findByProjectId = async (
    {
      projectId,
      offset = 0,
      limit,
      orderBy = KmipClientOrderBy.Name,
      orderDirection = OrderByDirection.ASC,
      search
    }: {
      projectId: string;
      offset?: number;
      limit?: number;
      orderBy?: KmipClientOrderBy;
      orderDirection?: OrderByDirection;
      search?: string;
    },
    tx?: Knex
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.KmipClient)
        .where("projectId", projectId)
        .where((qb) => {
          if (search) {
            void qb.whereILike("name", `%${search}%`);
          }
        })
        .select<
          (TKmipClients & {
            total_count: number;
          })[]
        >(selectAllTableCols(TableName.KmipClient), db.raw(`count(*) OVER() as total_count`))
        .orderBy(orderBy, orderDirection);

      if (limit) {
        void query.limit(limit).offset(offset);
      }

      const data = await query;

      return { kmipClients: data, totalCount: Number(data?.[0]?.total_count ?? 0) };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find KMIP clients by project id" });
    }
  };

  return {
    ...kmipClientOrm,
    findByProjectId,
    findByProjectAndClientId
  };
};
