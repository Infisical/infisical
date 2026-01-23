import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TDynamicSecrets } from "@app/db/schemas/dynamic-secrets";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import {
  buildFindFilter,
  ormify,
  prependTableNameToFindFilter,
  selectAllTableCols,
  sqlNestRelationships,
  TFindFilter,
  TFindOpt,
  TOrmify
} from "@app/lib/knex";
import { OrderByDirection, TDynamicSecretWithMetadata } from "@app/lib/types";
import { SecretsOrderBy } from "@app/services/secret/secret-types";

export interface TDynamicSecretDALFactory extends Omit<TOrmify<TableName.DynamicSecret>, "findOne"> {
  findOne: (filter: TFindFilter<TDynamicSecrets>, tx?: Knex) => Promise<TDynamicSecretWithMetadata>;
  listDynamicSecretsByFolderIds: (
    arg: {
      folderIds: string[];
      search?: string | undefined;
      limit?: number | undefined;
      offset?: number | undefined;
      orderBy?: SecretsOrderBy | undefined;
      orderDirection?: OrderByDirection | undefined;
    },
    tx?: Knex
  ) => Promise<Array<TDynamicSecretWithMetadata & { environment: string }>>;
  findWithMetadata: (
    filter: TFindFilter<TDynamicSecrets>,
    arg?: TFindOpt<TDynamicSecrets>
  ) => Promise<TDynamicSecretWithMetadata[]>;
}

export const dynamicSecretDALFactory = (db: TDbClient): TDynamicSecretDALFactory => {
  const orm = ormify(db, TableName.DynamicSecret);

  const findOne: TDynamicSecretDALFactory["findOne"] = async (filter, tx) => {
    const query = (tx || db.replicaNode())(TableName.DynamicSecret)
      .leftJoin(
        TableName.ResourceMetadata,
        `${TableName.ResourceMetadata}.dynamicSecretId`,
        `${TableName.DynamicSecret}.id`
      )
      .select(selectAllTableCols(TableName.DynamicSecret))
      .select(
        db.ref("id").withSchema(TableName.ResourceMetadata).as("metadataId"),
        db.ref("key").withSchema(TableName.ResourceMetadata).as("metadataKey"),
        db.ref("value").withSchema(TableName.ResourceMetadata).as("metadataValue")
      )
      .where(prependTableNameToFindFilter(TableName.DynamicSecret, filter));

    const docs = sqlNestRelationships({
      data: await query,
      key: "id",
      parentMapper: (el) => el,
      childrenMapper: [
        {
          key: "metadataId",
          label: "metadata" as const,
          mapper: ({ metadataKey, metadataValue, metadataId }) => ({
            id: metadataId,
            key: metadataKey,
            value: metadataValue || ""
          })
        }
      ]
    });

    return docs[0];
  };

  const findWithMetadata: TDynamicSecretDALFactory["findWithMetadata"] = async (
    filter,
    { offset, limit, sort, tx } = {}
  ) => {
    const query = (tx || db.replicaNode())(TableName.DynamicSecret)
      .leftJoin(
        TableName.ResourceMetadata,
        `${TableName.ResourceMetadata}.dynamicSecretId`,
        `${TableName.DynamicSecret}.id`
      )
      .select(selectAllTableCols(TableName.DynamicSecret))
      .select(
        db.ref("id").withSchema(TableName.ResourceMetadata).as("metadataId"),
        db.ref("key").withSchema(TableName.ResourceMetadata).as("metadataKey"),
        db.ref("value").withSchema(TableName.ResourceMetadata).as("metadataValue")
      )
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      .where(buildFindFilter(filter));

    if (limit) void query.limit(limit);
    if (offset) void query.offset(offset);
    if (sort) {
      void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
    }

    const docs = sqlNestRelationships({
      data: await query,
      key: "id",
      parentMapper: (el) => el,
      childrenMapper: [
        {
          key: "metadataId",
          label: "metadata" as const,
          mapper: ({ metadataKey, metadataValue, metadataId }) => ({
            id: metadataId,
            key: metadataKey,
            value: metadataValue || ""
          })
        }
      ]
    });

    return docs;
  };

  // find dynamic secrets for multiple environments (folder IDs are cross env, thus need to rank for pagination)
  const listDynamicSecretsByFolderIds: TDynamicSecretDALFactory["listDynamicSecretsByFolderIds"] = async (
    { folderIds, search, limit, offset = 0, orderBy = SecretsOrderBy.Name, orderDirection = OrderByDirection.ASC },
    tx
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.DynamicSecret)
        .whereIn("folderId", folderIds)
        .where((bd) => {
          if (search) {
            void bd.whereILike(`${TableName.DynamicSecret}.name`, `%${search}%`);
          }
        })
        .leftJoin(
          TableName.ResourceMetadata,
          `${TableName.ResourceMetadata}.dynamicSecretId`,
          `${TableName.DynamicSecret}.id`
        )
        .leftJoin(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.DynamicSecret}.folderId`)
        .leftJoin(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .select(
          selectAllTableCols(TableName.DynamicSecret),
          db.ref("slug").withSchema(TableName.Environment).as("environment"),
          db.raw(`DENSE_RANK() OVER (ORDER BY ${TableName.DynamicSecret}."name" ${orderDirection}) as rank`),
          db.ref("id").withSchema(TableName.ResourceMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.ResourceMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.ResourceMetadata).as("metadataValue")
        )
        .orderBy(`${TableName.DynamicSecret}.${orderBy}`, orderDirection);

      let queryWithLimit;
      if (limit) {
        const rankOffset = offset + 1;
        queryWithLimit = (tx || db.replicaNode())
          .with("w", query)
          .select("*")
          .from<Awaited<typeof query>[number]>("w")
          .where("w.rank", ">=", rankOffset)
          .andWhere("w.rank", "<", rankOffset + limit);
      }

      const dynamicSecrets = sqlNestRelationships({
        data: await (queryWithLimit || query),
        key: "id",
        parentMapper: (el) => el,
        childrenMapper: [
          {
            key: "metadataId",
            label: "metadata" as const,
            mapper: ({ metadataKey, metadataValue, metadataId }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue || ""
            })
          }
        ]
      });

      return dynamicSecrets;
    } catch (error) {
      throw new DatabaseError({ error, name: "List dynamic secret multi env" });
    }
  };

  return { ...orm, listDynamicSecretsByFolderIds, findOne, findWithMetadata };
};
