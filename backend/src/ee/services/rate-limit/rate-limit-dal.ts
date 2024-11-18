import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TRateLimitDALFactory = ReturnType<typeof rateLimitDALFactory>;

export const rateLimitDALFactory = (db: TDbClient) => ormify(db, TableName.RateLimit, {});
