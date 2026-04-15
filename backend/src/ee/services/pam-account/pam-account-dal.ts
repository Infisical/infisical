import { Knex } from "knex";
import RE2 from "re2";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";
import { applyMetadataFilter } from "@app/services/resource-metadata/resource-metadata-fns";

import { PamAccountOrderBy, PamAccountView } from "./pam-account-enums";

export type TPamAccountDALFactory = ReturnType<typeof pamAccountDALFactory>;

export const pamAccountDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamAccount);

  const findByProjectIdWithResourceDetails = async (
    {
      projectId,
      folderId,
      accountView = PamAccountView.Nested,
      search,
      limit,
      offset = 0,
      orderBy = PamAccountOrderBy.Name,
      orderDirection = OrderByDirection.ASC,
      filterResourceIds,
      metadataFilter
    }: {
      projectId: string;
      folderId?: string | null;
      accountView?: PamAccountView;
      search?: string;
      limit?: number;
      offset?: number;
      orderBy?: PamAccountOrderBy;
      orderDirection?: OrderByDirection;
      filterResourceIds?: string[];
      metadataFilter?: Array<{ key: string; value?: string }>;
    },
    tx?: Knex
  ) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const query = dbInstance(TableName.PamAccount)
        .leftJoin(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
        .leftJoin(TableName.PamAccountPolicy, `${TableName.PamAccount}.policyId`, `${TableName.PamAccountPolicy}.id`)
        .where(`${TableName.PamAccount}.projectId`, projectId);

      if (accountView === PamAccountView.Nested) {
        if (folderId) {
          void query.where(`${TableName.PamAccount}.folderId`, folderId);
        } else {
          void query.whereNull(`${TableName.PamAccount}.folderId`);
        }
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
            .whereRaw(`??.?? ILIKE ? ESCAPE '\\'`, [TableName.PamAccount, "name", pattern])
            .orWhereRaw(`??.?? ILIKE ? ESCAPE '\\'`, [TableName.PamResource, "name", pattern])
            .orWhereRaw(`??.?? ILIKE ? ESCAPE '\\'`, [TableName.PamAccount, "description", pattern]);
        });
      }

      if (filterResourceIds && filterResourceIds.length) {
        void query.whereIn(`${TableName.PamAccount}.resourceId`, filterResourceIds);
      }

      if (metadataFilter && metadataFilter.length > 0) {
        void applyMetadataFilter(query, metadataFilter, "pamAccountId", TableName.PamAccount);
      }

      const countQuery = query.clone().count("*", { as: "count" }).first();

      void query.select(selectAllTableCols(TableName.PamAccount)).select(
        // resource
        db.ref("name").withSchema(TableName.PamResource).as("resourceName"),
        db.ref("resourceType").withSchema(TableName.PamResource),
        db.ref("encryptedRotationAccountCredentials").withSchema(TableName.PamResource),
        // policy
        db.ref("name").withSchema(TableName.PamAccountPolicy).as("policyName")
      );

      const direction = orderDirection === OrderByDirection.ASC ? "ASC" : "DESC";

      void query.orderByRaw(`${TableName.PamAccount}.?? COLLATE "en-x-icu" ${direction}`, [orderBy]);

      if (typeof limit === "number") {
        void query.limit(limit).offset(offset);
      }

      const [results, countResult] = await Promise.all([query, countQuery]);
      const totalCount = Number(countResult?.count || 0);

      const accounts = results.map(
        // @ts-expect-error resourceName, resourceType, encryptedRotationAccountCredentials, policyName are from joined tables
        ({ resourceId, resourceName, resourceType, encryptedRotationAccountCredentials, policyName, ...account }) => ({
          ...account,
          resourceId,
          policyName: (policyName as string) || null,
          resource: {
            id: resourceId,
            name: resourceName as string,
            resourceType,
            encryptedRotationAccountCredentials
          }
        })
      );
      return { accounts, totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM accounts with resource details" });
    }
  };

  const findByIdWithResourceDetails = async (accountId: string, tx?: Knex) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const result = await dbInstance(TableName.PamAccount)
        .leftJoin(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
        .leftJoin(TableName.PamAccountPolicy, `${TableName.PamAccount}.policyId`, `${TableName.PamAccountPolicy}.id`)
        .where(`${TableName.PamAccount}.id`, accountId)
        .select(selectAllTableCols(TableName.PamAccount))
        .select(
          db.ref("name").withSchema(TableName.PamResource).as("resourceName"),
          db.ref("resourceType").withSchema(TableName.PamResource),
          db.ref("encryptedRotationAccountCredentials").withSchema(TableName.PamResource),
          db.ref("name").withSchema(TableName.PamAccountPolicy).as("policyName")
        )
        .first();

      if (!result) return null;

      const { resourceId, resourceName, resourceType, encryptedRotationAccountCredentials, policyName, ...account } =
        result as {
          resourceId: string;
          resourceName: string;
          resourceType: string;
          encryptedRotationAccountCredentials: Buffer | null;
          policyName: string | null;
        } & typeof result;

      return {
        ...account,
        resourceId,
        policyName: policyName || null,
        resource: {
          id: resourceId,
          name: resourceName,
          resourceType,
          encryptedRotationAccountCredentials
        }
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM account by ID with resource details" });
    }
  };

  const findMetadataByAccountIds = async (accountIds: string[], tx?: Knex) => {
    if (!accountIds.length) return {};
    const rows = await (tx || db.replicaNode())(TableName.ResourceMetadata)
      .select("id", "key", "value", "pamAccountId")
      .whereIn("pamAccountId", accountIds);
    const byAccountId: Record<string, Array<{ id: string; key: string; value: string }>> = {};
    for (const row of rows) {
      if (row.pamAccountId) {
        if (!byAccountId[row.pamAccountId]) byAccountId[row.pamAccountId] = [];
        byAccountId[row.pamAccountId].push({ id: row.id, key: row.key, value: row.value || "" });
      }
    }
    return byAccountId;
  };

  const findRotationCandidates = async (resourceIds: string[], minIntervalSeconds: number, tx?: Knex) => {
    if (!resourceIds.length) return [];

    try {
      const cutoff = new Date(Date.now() - minIntervalSeconds * 1000);

      return await (tx || db.replicaNode())(TableName.PamAccount)
        .whereIn("resourceId", resourceIds)
        .where((qb) => {
          void qb.whereNot("rotationStatus", "rotating").orWhereNull("rotationStatus");
        })
        .where((qb) => {
          void qb.where("lastRotatedAt", "<", cutoff).orWhere((inner) => {
            void inner.whereNull("lastRotatedAt").andWhere("createdAt", "<", cutoff);
          });
        })
        .select(selectAllTableCols(TableName.PamAccount));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find rotation candidates" });
    }
  };

  return {
    ...orm,
    findByProjectIdWithResourceDetails,
    findByIdWithResourceDetails,
    findMetadataByAccountIds,
    findRotationCandidates
  };
};
