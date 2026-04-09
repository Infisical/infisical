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

  const findByProjectIdWithParentDetails = async (
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
      filterDomainIds,
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
      filterDomainIds?: string[];
      metadataFilter?: Array<{ key: string; value?: string }>;
    },
    tx?: Knex
  ) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const query = dbInstance(TableName.PamAccount)
        .leftJoin(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
        .leftJoin(TableName.PamDomain, `${TableName.PamAccount}.domainId`, `${TableName.PamDomain}.id`)
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
            .orWhereRaw(`??.?? ILIKE ? ESCAPE '\\'`, [TableName.PamDomain, "name", pattern])
            .orWhereRaw(`??.?? ILIKE ? ESCAPE '\\'`, [TableName.PamAccount, "description", pattern]);
        });
      }

      const hasResourceFilter = filterResourceIds && filterResourceIds.length > 0;
      const hasDomainFilter = filterDomainIds && filterDomainIds.length > 0;

      if (hasResourceFilter && hasDomainFilter) {
        void query.where((qb) => {
          void qb
            .whereIn(`${TableName.PamAccount}.resourceId`, filterResourceIds)
            .orWhereIn(`${TableName.PamAccount}.domainId`, filterDomainIds);
        });
      } else if (hasResourceFilter) {
        void query.whereIn(`${TableName.PamAccount}.resourceId`, filterResourceIds);
      } else if (hasDomainFilter) {
        void query.whereIn(`${TableName.PamAccount}.domainId`, filterDomainIds);
      }

      if (metadataFilter && metadataFilter.length > 0) {
        void applyMetadataFilter(query, metadataFilter, "pamAccountId", TableName.PamAccount);
      }

      const countQuery = query.clone().count("*", { as: "count" }).first();

      void query.select(selectAllTableCols(TableName.PamAccount)).select(
        // resource (may be null for domain accounts)
        db.ref("name").withSchema(TableName.PamResource).as("resourceName"),
        db.ref("resourceType").withSchema(TableName.PamResource),
        db
          .ref("encryptedRotationAccountCredentials")
          .withSchema(TableName.PamResource)
          .as("resourceEncryptedRotationAccountCredentials"),
        // domain (may be null for resource accounts)
        db.ref("name").withSchema(TableName.PamDomain).as("domainName"),
        db.ref("domainType").withSchema(TableName.PamDomain),
        db
          .ref("encryptedRotationAccountCredentials")
          .withSchema(TableName.PamDomain)
          .as("domainEncryptedRotationAccountCredentials")
      );

      const direction = orderDirection === OrderByDirection.ASC ? "ASC" : "DESC";

      void query.orderByRaw(`${TableName.PamAccount}.?? COLLATE "en-x-icu" ${direction}`, [orderBy]);

      if (typeof limit === "number") {
        void query.limit(limit).offset(offset);
      }

      const [results, countResult] = await Promise.all([query, countQuery]);
      const totalCount = Number(countResult?.count || 0);

      const accounts = results.map((row) => {
        const r = row as Record<string, unknown>;
        const rId = row.resourceId as string | null;
        const dId = row.domainId as string | null;

        return {
          ...row,
          resourceId: rId,
          domainId: dId,
          resource: rId
            ? {
                id: rId,
                name: r.resourceName as string,
                resourceType: r.resourceType as string,
                encryptedRotationAccountCredentials: r.resourceEncryptedRotationAccountCredentials as Buffer | null
              }
            : null,
          domain: dId
            ? {
                id: dId,
                name: r.domainName as string,
                domainType: r.domainType as string,
                encryptedRotationAccountCredentials: r.domainEncryptedRotationAccountCredentials as Buffer | null
              }
            : null
        };
      });

      return { accounts, totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM accounts with parent details" });
    }
  };

  const findByIdWithParentDetails = async (accountId: string, tx?: Knex) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const result = await dbInstance(TableName.PamAccount)
        .leftJoin(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
        .leftJoin(TableName.PamDomain, `${TableName.PamAccount}.domainId`, `${TableName.PamDomain}.id`)
        .where(`${TableName.PamAccount}.id`, accountId)
        .select(selectAllTableCols(TableName.PamAccount))
        .select(
          // resource (may be null for domain accounts)
          db.ref("name").withSchema(TableName.PamResource).as("resourceName"),
          db.ref("resourceType").withSchema(TableName.PamResource),
          db
            .ref("encryptedRotationAccountCredentials")
            .withSchema(TableName.PamResource)
            .as("resourceEncryptedRotationAccountCredentials"),
          // domain (may be null for resource accounts)
          db.ref("name").withSchema(TableName.PamDomain).as("domainName"),
          db.ref("domainType").withSchema(TableName.PamDomain),
          db
            .ref("encryptedRotationAccountCredentials")
            .withSchema(TableName.PamDomain)
            .as("domainEncryptedRotationAccountCredentials")
        )
        .first();

      if (!result) return null;

      const {
        resourceId,
        domainId,
        resourceName,
        resourceType,
        resourceEncryptedRotationAccountCredentials,
        domainName,
        domainType,
        domainEncryptedRotationAccountCredentials,
        ...account
      } = result;

      return {
        ...account,
        resourceId,
        domainId,
        resource: resourceId
          ? {
              id: resourceId,
              name: resourceName,
              resourceType,
              encryptedRotationAccountCredentials: resourceEncryptedRotationAccountCredentials
            }
          : null,
        domain: domainId
          ? {
              id: domainId,
              name: domainName,
              domainType,
              encryptedRotationAccountCredentials: domainEncryptedRotationAccountCredentials
            }
          : null
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM account by ID with parent details" });
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

  const findRotationCandidates = async (
    {
      resourceIds,
      domainIds,
      minIntervalSeconds
    }: {
      resourceIds?: string[];
      domainIds?: string[];
      minIntervalSeconds: number;
    },
    tx?: Knex
  ) => {
    const hasResourceIds = resourceIds && resourceIds.length > 0;
    const hasDomainIds = domainIds && domainIds.length > 0;
    if (!hasResourceIds && !hasDomainIds) return [];

    try {
      const cutoff = new Date(Date.now() - minIntervalSeconds * 1000);

      return await (tx || db.replicaNode())(TableName.PamAccount)
        .where((qb) => {
          if (hasResourceIds) {
            void qb.whereIn("resourceId", resourceIds);
          }
          if (hasDomainIds) {
            void qb.orWhereIn("domainId", domainIds);
          }
        })
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
    findByProjectIdWithParentDetails,
    findByIdWithParentDetails,
    findMetadataByAccountIds,
    findRotationCandidates
  };
};
