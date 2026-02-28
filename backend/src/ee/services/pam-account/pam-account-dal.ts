import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";

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
      filterResourceIds
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
    },
    tx?: Knex
  ) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const query = dbInstance(TableName.PamAccount)
        .leftJoin(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
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
        const escapedSearch = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
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

      const countQuery = query.clone().count("*", { as: "count" }).first();

      void query.select(selectAllTableCols(TableName.PamAccount)).select(
        // resource
        db.ref("name").withSchema(TableName.PamResource).as("resourceName"),
        db.ref("resourceType").withSchema(TableName.PamResource),
        db.ref("encryptedRotationAccountCredentials").withSchema(TableName.PamResource)
      );

      const direction = orderDirection === OrderByDirection.ASC ? "ASC" : "DESC";

      void query.orderByRaw(`${TableName.PamAccount}.?? COLLATE "en-x-icu" ${direction}`, [orderBy]);

      if (typeof limit === "number") {
        void query.limit(limit).offset(offset);
      }

      const [results, countResult] = await Promise.all([query, countQuery]);
      const totalCount = Number(countResult?.count || 0);

      const accounts = results.map(
        // @ts-expect-error resourceName, resourceType, encryptedRotationAccountCredentials are from joined table
        ({ resourceId, resourceName, resourceType, encryptedRotationAccountCredentials, ...account }) => ({
          ...account,
          resourceId,
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
        .where(`${TableName.PamAccount}.id`, accountId)
        .select(selectAllTableCols(TableName.PamAccount))
        .select(
          db.ref("name").withSchema(TableName.PamResource).as("resourceName"),
          db.ref("resourceType").withSchema(TableName.PamResource),
          db.ref("encryptedRotationAccountCredentials").withSchema(TableName.PamResource)
        )
        .first();

      if (!result) return null;

      const { resourceId, resourceName, resourceType, encryptedRotationAccountCredentials, ...account } = result as {
        resourceId: string;
        resourceName: string;
        resourceType: string;
        encryptedRotationAccountCredentials: Buffer | null;
      } & typeof result;

      return {
        ...account,
        resourceId,
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

  const findAccountsDueForRotation = async (tx?: Knex) => {
    const dbClient = tx || db.replicaNode();

    const accounts = await dbClient(TableName.PamAccount)
      .innerJoin(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
      .whereNotNull(`${TableName.PamResource}.encryptedRotationAccountCredentials`)
      .whereNotNull(`${TableName.PamAccount}.rotationIntervalSeconds`)
      .where(`${TableName.PamAccount}.rotationEnabled`, true)
      .whereRaw(
        `COALESCE("${TableName.PamAccount}"."lastRotatedAt", "${TableName.PamAccount}"."createdAt") + "${TableName.PamAccount}"."rotationIntervalSeconds" * interval '1 second' < NOW()`
      )
      .select(selectAllTableCols(TableName.PamAccount));

    return accounts;
  };

  return {
    ...orm,
    findByProjectIdWithResourceDetails,
    findByIdWithResourceDetails,
    findAccountsDueForRotation
  };
};
