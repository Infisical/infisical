import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify, TOrmify } from "@app/lib/knex";

export type TRateLimitDALFactory = TOrmify<TableName.RateLimit>;

export const rateLimitDALFactory = (db: TDbClient): TRateLimitDALFactory => ormify(db, TableName.RateLimit, {});
