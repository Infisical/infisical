import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TEndpointNetworkRuleDALFactory = ReturnType<typeof endpointNetworkRuleDALFactory>;

export const endpointNetworkRuleDALFactory = (db: TDbClient) => ormify(db, TableName.EndpointNetworkRule);
