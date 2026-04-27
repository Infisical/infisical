import { Knex } from "knex";
import RE2 from "re2";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TPamResourceWithFavorite } from "@app/ee/services/pam-resource/pam-resource-types";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";
import { applyMetadataFilter } from "@app/services/resource-metadata/resource-metadata-fns";

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
      filterResourceTypes,
      metadataFilter,
      userId
    }: {
      projectId: string;
      search?: string;
      limit?: number;
      offset?: number;
      orderBy?: PamResourceOrderBy;
      orderDirection?: OrderByDirection;
      filterResourceTypes?: string[];
      metadataFilter?: Array<{ key: string; value?: string }>;
      userId?: string;
    },
    tx?: Knex
  ): Promise<{ resources: TPamResourceWithFavorite[]; totalCount: number }> => {
    try {
      const dbInstance = tx || db.replicaNode();
      const query = dbInstance(TableName.PamResource).where(`${TableName.PamResource}.projectId`, projectId);

      if (userId) {
        void query.leftJoin(TableName.PamResourceFavorite, function joinFavorites() {
          this.on(`${TableName.PamResourceFavorite}.pamResourceId`, `${TableName.PamResource}.id`).andOn(
            `${TableName.PamResourceFavorite}.userId`,
            db.raw("?", [userId])
          );
        });
      }

      if (search) {
        // escape special characters (`%`, `_`) and the escape character itself (`\`)
        const escapedSearch = search
          .replace(new RE2(/\\/g), "\\\\")
          .replace(new RE2(/%/g), "\\%")
          .replace(new RE2(/_/g), "\\_");
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

      if (metadataFilter && metadataFilter.length > 0) {
        void applyMetadataFilter(query, metadataFilter, "pamResourceId", TableName.PamResource);
      }

      const countQuery = query.clone().count("*", { as: "count" }).first();

      void query.select(selectAllTableCols(TableName.PamResource));

      if (userId) {
        void query.select(
          db.raw(
            `CASE WHEN "${TableName.PamResourceFavorite}"."id" IS NOT NULL THEN true ELSE false END as "isFavorite"`
          )
        );
      } else {
        void query.select(db.raw(`false as "isFavorite"`));
      }

      const direction = orderDirection === OrderByDirection.ASC ? "ASC" : "DESC";

      if (userId) {
        void query.orderByRaw(`"isFavorite" DESC`);
      }
      void query.orderByRaw(`${TableName.PamResource}.?? COLLATE "en-x-icu" ${direction}`, [orderBy]);

      if (typeof limit === "number") {
        void query.limit(limit).offset(offset);
      }

      const [resources, countResult] = await Promise.all([query, countQuery]);
      const totalCount = Number(countResult?.count || 0);

      return { resources: resources as TPamResourceWithFavorite[], totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM resources" });
    }
  };

  const findMetadataByResourceIds = async (resourceIds: string[], tx?: Knex) => {
    if (!resourceIds.length) return {};
    const rows = await (tx || db.replicaNode())(TableName.ResourceMetadata)
      .select("id", "key", "value", "pamResourceId")
      .whereIn("pamResourceId", resourceIds);
    const byResourceId: Record<string, Array<{ id: string; key: string; value: string }>> = {};
    for (const row of rows) {
      if (row.pamResourceId) {
        if (!byResourceId[row.pamResourceId]) byResourceId[row.pamResourceId] = [];
        byResourceId[row.pamResourceId].push({ id: row.id, key: row.key, value: row.value || "" });
      }
    }
    return byResourceId;
  };

  const findByDomainId = async (domainId: string, tx?: Knex) => {
    try {
      const resources = await (tx || db.replicaNode())(TableName.PamResource)
        .select(selectAllTableCols(TableName.PamResource))
        .where(`${TableName.PamResource}.domainId`, domainId)
        .orderBy(`${TableName.PamResource}.name`, "asc");

      return resources;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM resources by domain ID" });
    }
  };

  const findByGatewayId = async (gatewayId: string, tx?: Knex) => {
    const docs = await (tx || db.replicaNode())(TableName.PamResource)
      .leftJoin(TableName.Project, `${TableName.PamResource}.projectId`, `${TableName.Project}.id`)
      .where(`${TableName.PamResource}.gatewayId`, gatewayId)
      .select(
        db.ref("id").withSchema(TableName.PamResource),
        db.ref("name").withSchema(TableName.PamResource),
        db.ref("projectId").withSchema(TableName.PamResource),
        db.ref("resourceType").withSchema(TableName.PamResource),
        db.ref("name").withSchema(TableName.Project).as("projectName")
      );

    return docs;
  };

  const countByGatewayId = async (gatewayId: string, tx?: Knex) => {
    const result = await (tx || db.replicaNode())(TableName.PamResource)
      .where(`${TableName.PamResource}.gatewayId`, gatewayId)
      .count("id")
      .first();

    return parseInt(String(result?.count || "0"), 10);
  };

  return {
    ...orm,
    findById,
    findByProjectId,
    findMetadataByResourceIds,
    findByDomainId,
    findByGatewayId,
    countByGatewayId
  };
};
