import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TIdentityMetadataDALFactory = ReturnType<typeof identityMetadataDALFactory>;

export const identityMetadataDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.IdentityMetadata);
  return orm;
};
