import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TResourceMetadataDALFactory = ReturnType<typeof resourceMetadataDALFactory>;

export const resourceMetadataDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ResourceMetadata);

  return orm;
};
