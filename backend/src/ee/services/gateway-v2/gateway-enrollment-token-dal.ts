import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TGatewayEnrollmentTokenDALFactory = ReturnType<typeof gatewayEnrollmentTokenDALFactory>;

export const gatewayEnrollmentTokenDALFactory = (db: TDbClient) => {
  return ormify(db, TableName.GatewayEnrollmentTokens);
};
