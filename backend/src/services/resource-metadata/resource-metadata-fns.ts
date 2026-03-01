import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

type TMetadataFilterEntry = { key: string; value?: string };

/**
 * Applies metadata filter conditions to a Knex query builder.
 * For each filter entry, adds a whereExists subquery against the resource_metadata table.
 * Multiple entries are AND-ed together.
 */
export const applyMetadataFilter = (
  query: Knex.QueryBuilder,
  metadataFilter: TMetadataFilterEntry[] | undefined,
  joinColumn: "pamResourceId" | "pamAccountId",
  parentTable: TableName
) => {
  if (!metadataFilter || metadataFilter.length === 0) return;

  for (const entry of metadataFilter) {
    void query.whereExists((subQuery) => {
      void subQuery
        .select("id")
        .from(TableName.ResourceMetadata)
        .whereRaw(`??.?? = ??.??`, [TableName.ResourceMetadata, joinColumn, parentTable, "id"])
        .where(`${TableName.ResourceMetadata}.key`, entry.key);

      if (entry.value !== undefined) {
        void subQuery.where(`${TableName.ResourceMetadata}.value`, entry.value);
      }
    });
  }
};
