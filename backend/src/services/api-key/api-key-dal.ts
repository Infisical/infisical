import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TApiKeyDALFactory = ReturnType<typeof apiKeyDALFactory>;

export const apiKeyDALFactory = (db: TDbClient) => ormify(db, TableName.ApiKey);
