import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TServerCfgDalFactory = ReturnType<typeof serverCfgDalFactory>;

export const serverCfgDalFactory = (db: TDbClient) => ormify(db, TableName.ServerConfig, {});
