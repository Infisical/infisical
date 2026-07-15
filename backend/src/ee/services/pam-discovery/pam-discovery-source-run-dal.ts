import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TPamDiscoverySourceRunDALFactory = ReturnType<typeof pamDiscoverySourceRunDALFactory>;

export const pamDiscoverySourceRunDALFactory = (db: TDbClient) => ormify(db, TableName.PamDiscoverySourceRun);
