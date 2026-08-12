import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TEndpointEgressRuleDALFactory = ReturnType<typeof endpointEgressRuleDALFactory>;

export const endpointEgressRuleDALFactory = (db: TDbClient) => ormify(db, TableName.EndpointEgressRule);
