import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TEndpointCounterDALFactory = ReturnType<typeof endpointCounterDALFactory>;

export const endpointCounterDALFactory = (db: TDbClient) => ormify(db, TableName.EndpointCounter);
