import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TKmsKeyImportMetaDALFactory = ReturnType<typeof kmsKeyImportMetaDALFactory>;

export const kmsKeyImportMetaDALFactory = (db: TDbClient) => ormify(db, TableName.KmsKeyImportMeta);
