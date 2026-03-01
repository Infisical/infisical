import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export const applyMetadataFilter = <T extends Knex.QueryBuilder>(
  query: T,
  metadataFilter: Array<{ key: string; value?: string }>,
  joinColumn: "pamResourceId" | "pamAccountId",
  parentTable: TableName
): T => {
  return query.where((qb) => {
    metadataFilter.forEach((meta) => {
      void qb.whereExists((subQuery) => {
        void subQuery
          .select(joinColumn)
          .from(TableName.ResourceMetadata)
          .whereRaw(`??.?? = ??.??`, [TableName.ResourceMetadata, joinColumn, parentTable, "id"])
          .where(`${TableName.ResourceMetadata}.key`, meta.key);
        if (meta.value !== undefined) {
          void subQuery.where(`${TableName.ResourceMetadata}.value`, meta.value);
        }
      });
    });
  }) as T;
};
