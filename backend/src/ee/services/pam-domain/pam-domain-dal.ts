import { Knex } from "knex";
import RE2 from "re2";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";

import { PamDomainOrderBy } from "./pam-domain-enums";

export type TPamDomainDALFactory = ReturnType<typeof pamDomainDALFactory>;

export const pamDomainDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamDomain);

  const findById = async (id: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.PamDomain)
        .leftJoin(TableName.GatewayV2, `${TableName.PamDomain}.gatewayId`, `${TableName.GatewayV2}.id`)
        .where(`${TableName.PamDomain}.id`, id)
        .select(selectAllTableCols(TableName.PamDomain))
        .select(
          db.ref("name").withSchema(TableName.GatewayV2).as("gatewayName"),
          db.ref("identityId").withSchema(TableName.GatewayV2).as("gatewayIdentityId")
        )
        .first();

      return result || null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM domain by ID" });
    }
  };

  const findByProjectId = async (
    {
      projectId,
      search,
      limit,
      offset = 0,
      orderBy = PamDomainOrderBy.Name,
      orderDirection = OrderByDirection.ASC,
      filterDomainTypes,
      discoveryFingerprint
    }: {
      projectId: string;
      search?: string;
      limit?: number;
      offset?: number;
      orderBy?: PamDomainOrderBy;
      orderDirection?: OrderByDirection;
      filterDomainTypes?: string[];
      discoveryFingerprint?: string;
    },
    tx?: Knex
  ) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const query = dbInstance(TableName.PamDomain).where(`${TableName.PamDomain}.projectId`, projectId);

      if (search) {
        const escapedSearch = search
          .replace(new RE2(/\\/g), "\\\\")
          .replace(new RE2(/%/g), "\\%")
          .replace(new RE2(/_/g), "\\_");
        const pattern = `%${escapedSearch}%`;
        void query.whereRaw(`??.?? ILIKE ? ESCAPE '\\'`, [TableName.PamDomain, "name", pattern]);
      }

      if (filterDomainTypes && filterDomainTypes.length) {
        void query.whereIn(`${TableName.PamDomain}.domainType`, filterDomainTypes);
      }

      if (discoveryFingerprint) {
        void query.where(`${TableName.PamDomain}.discoveryFingerprint`, discoveryFingerprint);
      }

      const countQuery = query.clone().count("*", { as: "count" }).first();

      void query.select(selectAllTableCols(TableName.PamDomain));

      const direction = orderDirection === OrderByDirection.ASC ? "ASC" : "DESC";
      void query.orderByRaw(`${TableName.PamDomain}.?? COLLATE "en-x-icu" ${direction}`, [orderBy]);

      if (typeof limit === "number") {
        void query.limit(limit).offset(offset);
      }

      const [results, countResult] = await Promise.all([query, countQuery]);
      const totalCount = Number(countResult?.count || 0);

      return { domains: results, totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM domains by project" });
    }
  };

  const findMetadataByDomainIds = async (domainIds: string[], tx?: Knex) => {
    if (!domainIds.length) return {};
    const rows = await (tx || db.replicaNode())(TableName.ResourceMetadata)
      .select("id", "key", "value", "pamDomainId")
      .whereIn("pamDomainId", domainIds);
    const byDomainId: Record<string, Array<{ id: string; key: string; value: string }>> = {};
    for (const row of rows) {
      if (row.pamDomainId) {
        if (!byDomainId[row.pamDomainId]) byDomainId[row.pamDomainId] = [];
        byDomainId[row.pamDomainId].push({ id: row.id, key: row.key, value: row.value || "" });
      }
    }
    return byDomainId;
  };

  return {
    ...orm,
    findById,
    findByProjectId,
    findMetadataByDomainIds
  };
};
