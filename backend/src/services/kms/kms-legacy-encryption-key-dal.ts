import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TKmsLegacyEncryptionKeyDALFactory = ReturnType<typeof kmsLegacyEncryptionKeyDALFactory>;

export const kmsLegacyEncryptionKeyDALFactory = (db: TDbClient) => ormify(db, TableName.KmsLegacyEncryptionKey);
