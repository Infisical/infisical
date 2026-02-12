import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";

import { PamResourceOrderBy } from "./pam-resource-enums";

export type TPamResourceDALFactory = ReturnType<typeof pamResourceDALFactory>;
export const pamResourceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamResource);

  const findById = async (id: string, tx?: Knex) => {
    const doc = await (tx || db.replicaNode())(TableName.PamResource)
      .leftJoin(TableName.GatewayV2, `${TableName.PamResource}.gatewayId`, `${TableName.GatewayV2}.id`)
      .select(selectAllTableCols(TableName.PamResource))
      .select(db.ref("name").withSchema(TableName.GatewayV2).as("gatewayName"))
      .select(db.ref("identityId").withSchema(TableName.GatewayV2).as("gatewayIdentityId"))
      .where(`${TableName.PamResource}.id`, id)
      .first();

    return doc;
  };

  const findByProjectId = async (
    {
      projectId,
      search,
      limit,
      offset = 0,
      orderBy = PamResourceOrderBy.Name,
      orderDirection = OrderByDirection.ASC,
      filterResourceTypes
    }: {
      projectId: string;
      search?: string;
      limit?: number;
      offset?: number;
      orderBy?: PamResourceOrderBy;
      orderDirection?: OrderByDirection;
      filterResourceTypes?: string[];
    },
    tx?: Knex
  ) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const query = dbInstance(TableName.PamResource).where(`${TableName.PamResource}.projectId`, projectId);

      if (search) {
        // escape special characters (`%`, `_`) and the escape character itself (`\`)
        const escapedSearch = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
        const pattern = `%${escapedSearch}%`;
        void query.where((q) => {
          void q
            .whereRaw(`??.?? ILIKE ? ESCAPE '\\'`, [TableName.PamResource, "name", pattern])
            .orWhereRaw(`??.?? ILIKE ? ESCAPE '\\'`, [TableName.PamResource, "resourceType", pattern]);
        });
      }

      if (filterResourceTypes && filterResourceTypes.length) {
        void query.whereIn(`${TableName.PamResource}.resourceType`, filterResourceTypes);
      }

      const countQuery = query.clone().count("*", { as: "count" }).first();

      void query.select(selectAllTableCols(TableName.PamResource));

      const direction = orderDirection === OrderByDirection.ASC ? "ASC" : "DESC";

      void query.orderByRaw(`${TableName.PamResource}.?? COLLATE "en-x-icu" ${direction}`, [orderBy]);

      if (typeof limit === "number") {
        void query.limit(limit).offset(offset);
      }

      const [resources, countResult] = await Promise.all([query, countQuery]);
      const totalCount = Number(countResult?.count || 0);

      return { resources, totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM resources" });
    }
  };

  const findByAdServerResourceId = async (adServerResourceId: string, tx?: Knex) => {
    try {
      const resources = await (tx || db.replicaNode())(TableName.PamResource)
        .select(selectAllTableCols(TableName.PamResource))
        .where(`${TableName.PamResource}.adServerResourceId`, adServerResourceId)
        .orderByRaw(`${TableName.PamResource}."name" COLLATE "en-x-icu" ASC`);

      return resources;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM resources by AD server resource ID" });
    }
  };

  return { ...orm, findById, findByProjectId, findByAdServerResourceId };
};
