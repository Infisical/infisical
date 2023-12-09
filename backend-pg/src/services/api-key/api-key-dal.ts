import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TApiKeyDalFactory = ReturnType<typeof apiKeyDalFactory>;

export const apiKeyDalFactory = (db: TDbClient) => ormify(db, TableName.ApiKey);
